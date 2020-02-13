# ImageLabelerApp
Implementation of flask application for image labeling

## Start work
* Move images for labeling to `images` folder
* Edit labels dictionary in `app.py` file for your task
```python
labels = {
	'text' : (255, 0, 0),
	'table' : (0, 255, 0),
	'picture' : (0, 0, 255),
}
```
* Launch application using `python app.py`
* Go to `localhost:5000` and label your images