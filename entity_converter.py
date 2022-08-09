class EntityConverter:
    def __init__(self, bbox_format: str, use_relative: bool):
        if bbox_format not in ['xywh', 'xyxy', 'xcycwh']:
            raise ValueError(f'Invalid bbox format ({bbox_format})')

        self.bbox_format = bbox_format
        self.use_relative = use_relative

    def convert(self, entity: dict, img_height: int, img_width: int) -> dict:
        x, y = entity['x'], entity['y']
        w, h = entity['width'], entity['height']

        if not self.use_relative:
            x, y = int(x * img_width), int(y * img_height)
            w, h = int(w * img_width), int(h * img_height)

        converted_entity = {
            'label': entity['label']
        }

        if self.bbox_format == 'xyxy':
            converted_entity['x1'] = x
            converted_entity['y1'] = y
            converted_entity['x2'] = x + w
            converted_entity['y2'] = y + h
        elif self.bbox_format == 'xcycwh':
            converted_entity['xc'] = x + w / 2
            converted_entity['yc'] = y + h / 2
            converted_entity['width'] = w
            converted_entity['height'] = h
        else:
            converted_entity['x'] = x
            converted_entity['y'] = y
            converted_entity['width'] = w
            converted_entity['height'] = h

        return converted_entity

    def convert_inverse(self, entity: dict, img_height: int, img_width: int) -> dict:
        converted_entity = {
            'label': entity['label']
        }

        if self.bbox_format == 'xyxy':
            x, y, x2, y2 = entity['x1'], entity['y1'], entity['x2'], entity['y2']
            w, h = x2 - x, y2 - y
        elif self.bbox_format == 'xcycwh':
            xc, yc, w, h = entity['xc'], entity['yc'], entity['width'], entity['height']
            x, y = xc - w / 2, yc - h / 2
        else:
            x, y, w, h = entity['x'], entity['y'], entity['width'], entity['height']

        if not self.use_relative:
            x, y, w, h = x / img_width, y / img_height, w / img_width, h / img_height

        converted_entity['x'] = x
        converted_entity['y'] = y
        converted_entity['width'] = w
        converted_entity['height'] = h

        return converted_entity
