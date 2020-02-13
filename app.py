import os
import random
import json
import cv2

from flask import Flask
from flask import request, send_file, redirect, send_from_directory

app = Flask(__name__)
	
app.config['IMAGES_FOLDER'] = 'images' # папка с изображениями для разметки
app.config['LABELS_FOLDER'] = 'labeled' # папка для сохраняемых изображений и разметок
app.config['JS_FOLDER'] = 'js' # папка с js кодом
app.config['CSS_FOLDER'] = 'css' # папка со стилями

# метки и соответствующие им цвета (BGR формат)
labels = {
	'text' : (255, 0, 0),
	'table' : (0, 255, 0),
	'picture' : (0, 0, 255),
}

@app.route('/images/<filename>')
def image_file(filename):
	return send_from_directory(app.config['IMAGES_FOLDER'], filename)

@app.route('/js/<filename>')
def js_file(filename):
	return send_from_directory(app.config['JS_FOLDER'], filename)

@app.route('/css/<filename>')
def css_file(filename):
	return send_from_directory(app.config['CSS_FOLDER'], filename)

def get_js_colors():
	return str([str(r) + ', ' + str(g) + ', ' + str(b) for b, g, r in labels.values()])

def get_labels_info():
	info = [str(i + 1) + ' - ' + label for i, label in enumerate(labels.keys())]
	return str(info)[1:-1].replace("'", "")

def make_labeler(filename, total):
	return '''
		<!DOCTYPE html>
		<html>
		<head>
			<title>Средство для разметки изображений</title>
			<meta charset="utf-8">
			<link rel="stylesheet" href="css/labeler.css?v=8" />
		</head>
		<body>
			<h1>Bounding box annotator (осталось разметить: {total})</h1>

			<div class="labeler" draggable=false oncontextmenu="return false;">
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
				const labels = {labels}
				const colors = {colors}

				let labeler = new Labeler(labels, colors)

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
			'''.format(filename=filename, total=total, labels=str(list(labels.keys())), colors=get_js_colors(), info=get_labels_info())

@app.route('/', methods=['GET'])
def label_image():
	images = os.listdir(app.config['IMAGES_FOLDER']) # получаем все доступные изображения

	if len(images) == 0: # если их нет, то и размечать нечего
		return "Все изображения были размечены"

	return make_labeler(random.choice(images), len(images)) # иначе создаём страницу с интерфейсом для разметки

# сохранение изображения с отрисовкой разметки
def draw_labeling(name, data):
	img = cv2.imread(app.config['IMAGES_FOLDER'] + '/' + name) # открываем размеченное изображение

	for entity in data['entities']:
		label = entity['label']
		x1 = int(entity['x'] * img.shape[1])
		y1 = int(entity['y'] * img.shape[0])
		x2 = int((entity['x'] + entity['width']) * img.shape[1])
		y2 = int((entity['y'] + entity['height']) * img.shape[0])

		color = labels[label] # получаем цвет метки

		# накладываем слегка прозрачный bbox с выделенным объектом на картинку
		tmp = img.copy()
		cv2.rectangle(tmp, (x1, y1), (x2, y2), color, -1)
		cv2.addWeighted(img, 0.8, tmp, 0.2, 0, img)
		cv2.putText(img, label, (x1, y1), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
		cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

	cv2.imwrite(app.config['LABELS_FOLDER'] + '/test_' + name, img) # сохраняем созданное изображение

@app.route('/save')
def save_file():
	data = json.loads(request.args.get('entities')) # получаем размеченные объекты из json
	name = data['name'] # получаем имя изображения

	draw_labeling(name.strip("/"), data) # отрисовываем результат разметки
	
	os.replace(app.config['IMAGES_FOLDER'] + '/' + name, app.config['LABELS_FOLDER'] + '/' + name) # перемещаем изображение в папку размеченных изображений

	with open(app.config['LABELS_FOLDER'] + '/' + name + '.json', 'w') as outfile:
		json.dump(data, outfile, indent=4) # сохраняем json с объектами

	return redirect("/") # возвращаем на страницу разметки

if __name__ == '__main__':
	app.run(debug=True)