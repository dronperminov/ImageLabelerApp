import os
import random
import json
import cv2

from flask import Flask
from flask import request, redirect, send_from_directory


with open("config.json", encoding="utf-8") as f:
	config = json.load(f)

app = Flask(__name__)
	
app.config['IMAGES_FOLDER'] = config.get('images_path', 'images')
app.config['LABELS_FOLDER'] = config.get('labeled_path', 'labeled')
app.config['JS_FOLDER'] = 'js'
app.config['CSS_FOLDER'] = 'css'

title = config.get('title', 'Bounding box annotator')
port = config.get('port', 5000)
labels = config['labels']

bbox_format = config.get('bbox_format', 'xywh')
use_relative = config.get('use_relative', True)

if bbox_format not in ['xywh', 'xyxy', 'xcycwh']:
	raise ValueError(f'Invalid bbox format ({bbox_format})')

sampling = config.get('sampling', 'sequential')

if sampling not in ['random', 'sequential']:
	raise ValueError(f'Invalid sampling mode ({sampling})')


@app.route('/images/<filename>')
def image_file(filename):
	return send_from_directory(app.config['IMAGES_FOLDER'], filename)


@app.route('/js/<filename>')
def js_file(filename):
	return send_from_directory(app.config['JS_FOLDER'], filename)


@app.route('/css/<filename>')
def css_file(filename):
	return send_from_directory(app.config['CSS_FOLDER'], filename)


def get_entities(filename):
	json_path = os.path.join(app.config['LABELS_FOLDER'], f'{filename}.json')

	if not os.path.exists(json_path):
		return []

	with open(json_path, 'r') as f:
		data = json.load(f)

	img_path = os.path.join(app.config['IMAGES_FOLDER'], filename)
	img = cv2.imread(img_path)
	img_height = img.shape[0]
	img_width = img.shape[1]

	entities = data['entities']

	for i, entity in enumerate(entities):
		if bbox_format == 'xyxy':
			x, y, x2, y2 = entity['x1'], entity['y1'], entity['x2'], entity['y2']
			w, h = x2 - x, y2 - y
		elif bbox_format == 'xcycwh':
			xc, yc, w, h = entity['xc'], entity['yc'], entity['width'], entity['height']
			x, y = xc - w / 2, yc - h / 2
		else:
			x, y, w, h = entity['x'], entity['y'], entity['width'], entity['height']

		if not use_relative:
			x, y, w, h = x / img_width, y / img_height, w / img_width, h / img_height

		entities[i]['x'] = x
		entities[i]['y'] = y
		entities[i]['width'] = w
		entities[i]['height'] = h

	return entities


def make_labeler(filename, total):
	colors_js = ", ".join(f'"{r}, {g}, {b}"' for r, g, b in labels.values())
	labels_js = ", ".join(f'"{key}"' for key in labels)
	info = ", ".join(f"{i + 1} - {label}" for i, label in enumerate(labels.keys()) if i < 10)
	entities = get_entities(filename)

	return f'''
		<!DOCTYPE html>
		<html>
		<head>
			<title>{title} | Осталось разметить: {total}</title>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no" />
			<link rel="stylesheet" href="css/labeler.css" />
		</head>
		<body>
			<div class="labeler" draggable=false oncontextmenu="return false;">
				<input id="mode-box" type="checkbox"/>
				<div class="labeler-image" draggable=false>
					<img id="img" src="/images/{filename}" draggable=false>
				</div>

				<div class="labeler-menu">
					<div class="labeler-entities">
						<textarea id="entities-data" cols=10 readonly></textarea>
					</div>

					<div class="labeler-tools">
						<input class="btn" type="submit" id="reset-btn" value="reset"></input>
						<input class="btn" type="submit" id="skip-btn" value="skip"></input>
						<input class="btn" type="submit" id="save-btn" value="save"></input>
					</div>

					<div class="labeler-instruction">
						<p><b>Удалить выделение</b>: правая кнопка мыши</p>
						<p><b>Клавиши выделения</b>: {info}</p>
					</div>
				</div>
			</div>

			<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"></script>
			<script src="js/labeler.js"></script>

			<script type="text/javascript">
				const labels = [{labels_js}]
				const colors = [{colors_js}]
				const entities = {entities}

				$('.labeler-image').ready(function() {{
					let labeler = new Labeler(labels, colors, entities)
					labeler.init_from_entities(entities)
				}})

				$("#save-btn").click(function(e) {{
					if (confirm("Saving: are you sure?")) {{
						window.location.replace('/save?entities=' + $("#entities-data").text())
					}}
				}})

				$("#skip-btn").click(function(e) {{
					window.location.replace('/')
				}})
			</script>
		</body>
		</html>
			'''


@app.route('/', methods=['GET'])
def label_image():
	images = os.listdir(app.config['IMAGES_FOLDER'])
	images = sorted(images)

	if len(images) == 0:
		return "Все изображения были размечены"

	if sampling == 'random':
		image = random.choice(images)
	else:
		image = images[0]

	return make_labeler(image, len(images))


def draw_labeling(img, data: dict, test_path: str):
	for entity in data['entities']:
		label = entity['label']
		x1 = int(entity['x'] * img.shape[1])
		y1 = int(entity['y'] * img.shape[0])
		x2 = int((entity['x'] + entity['width']) * img.shape[1])
		y2 = int((entity['y'] + entity['height']) * img.shape[0])

		r, g, b = labels[label]
		color = b, g, r

		tmp = img.copy()
		cv2.rectangle(tmp, (x1, y1), (x2, y2), color, -1)
		cv2.addWeighted(img, 0.8, tmp, 0.2, 0, img)
		cv2.putText(img, label, (x1, y1), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
		cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

	cv2.imwrite(test_path, img)


def convert_bbox(entity: dict, height: int, width: int) -> dict:
	x, y = entity['x'], entity['y']
	w, h = entity['width'], entity['height']

	if not use_relative:
		x, y = int(x * width), int(y * height)
		w, h = int(w * width), int(h * height)

	converted_entity = {
		'label': entity['label']
	}

	if bbox_format == 'xywh':
		converted_entity['x'] = x
		converted_entity['y'] = y
		converted_entity['width'] = w
		converted_entity['height'] = h
	elif bbox_format == 'xyxy':
		converted_entity['x1'] = x
		converted_entity['y1'] = y
		converted_entity['x2'] = x + w
		converted_entity['y2'] = y + h
	elif bbox_format == 'xcycwh':
		converted_entity['xc'] = x + w / 2
		converted_entity['yc'] = y + h / 2
		converted_entity['width'] = w
		converted_entity['height'] = h

	return converted_entity


@app.route('/save')
def save_file():
	data = json.loads(request.args.get('entities'))
	name = data['name']

	prev_img_path = os.path.join(app.config['IMAGES_FOLDER'], name)
	img_path = os.path.join(app.config['LABELS_FOLDER'], name)
	json_path = os.path.join(app.config['LABELS_FOLDER'], f'{name}.json')
	test_path = os.path.join(app.config['LABELS_FOLDER'], f'test_{name}')

	img = cv2.imread(prev_img_path)
	h, w = img.shape[0], img.shape[1]
	draw_labeling(img, data, test_path)

	os.replace(prev_img_path, img_path)

	for i, entity in enumerate(data['entities']):
		data['entities'][i] = convert_bbox(entity, h, w)

	with open(json_path, 'w') as f:
		json.dump(data, f, indent=4, ensure_ascii=False)

	return redirect("/")


if __name__ == '__main__':
	if not os.path.exists(app.config['LABELS_FOLDER']):
		os.makedirs(app.config['LABELS_FOLDER'])

	app.run(debug=True, port=port)
