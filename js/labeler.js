function Labeler(labels, colors) {
	this.diff = $(window).innerWidth() < 767 ? 15 : 5 // граница реагирования для изменения размера

	this.labels = labels // массив меток
	this.colors = colors // массив цветов для этих меток

	this.startPoint = null // стартовая точка bbox'а
	this.endPoint = null // конечная точка bbox'а
	this.currBox = null // текущий bbox
	this.entities = [] // массив выделенных объектов
	this.entities_boxes = [] // массив выделенных блоков

	this.moveIndex = -1 // индекс перемещаемого bbox'а
	this.movePoint = null // координата перемещаемого bbox'а

	this.resizeIndex = -1 // индекс масштабируемого bbox'а
	this.resizeType = null // тип изменения размера
	this.resizePoint = null // координата масштабируемого bbox'а

	this.isBlocked = false // заблокировано ли управление

	this.img = $('.labeler-image') // блок с картинкой

	this.scale_value = 2 // шаг масштабирования картинки
	this.scale = 1 // текуший масштаб

	this.offsetLeft = this.img.offset().left // отступ картинки слева
	this.offsetTop = this.img.offset().top // отступ картинки сверху

	this.initialize() // настраиваем обработчики
}

// настройка обработчиков
Labeler.prototype.initialize = function() {
	let labeler = this

	$(document).mousedown(function(e) { labeler.mousedown(e) })
	$(document).mouseup(function(e) { labeler.mouseup(e) })
	$(document).mousemove(function(e) { labeler.mousemove(e) })
	$(document).keydown(function(e) { labeler.keydown(e) })

	// мобильные обработчики
	$(document).on("touchstart", function(e) {
		if (!$("#mode-box").is(":checked")) // игнорируем, если режим скроллинга
			return

		if (e.originalEvent.touches.length > 2) // игнорируем, если больше двух касаний
			return

		// кнопку считаем левой, если одно касание, иначе правой
		if (e.originalEvent.touches.length == 1)
			e.originalEvent.targetTouches[0].button = 0
		else
			e.originalEvent.targetTouches[0].button = 2

		labeler.mousedown(e.originalEvent.targetTouches[0]) // вызываем событие нажатия мыши
	})

	$(document).on("touchend", function(e) {
		if (!$("#mode-box").is(":checked")) // игнорируем, если режим скролинга
			return

		if (e.originalEvent.changedTouches.length == 1) { // если одно нажатие
			e.originalEvent.changedTouches[0].button = 0 // то считаем кнопку левой
			labeler.mouseup(e.originalEvent.changedTouches[0]) // и вызываем событие отжатия кнопки мыши
		}
	})

	document.addEventListener("touchmove", function(e) {
		if (!$("#mode-box").is(":checked")) // игнорируем, если режим скроллинга
			return

		// если одно нажатие
		if (e.changedTouches.length == 1) {
			labeler.mousemove(e.changedTouches[0]) // вызывваем событие перемещения мыши
			e.preventDefault() // отключаем обработку события по умолчанию
			return false
		}
	}, { passive: false })

	// запрещаем перетаскивание картинки
	$(document).on("dragstart", function(e) {
		if (e.target.nodeName.toUpperCase() == "IMG")
			return false;
	});

	// удаляем все сущности при клике на кнопку сброса
	$("#reset-btn").click(function(e) {
		labeler.remove_all()
	})

	$("#mode-box").css("top", labeler.img.offset().top + "px")

	this.show_entities() // отображаем сущности
}

// получение точки
Labeler.prototype.get_point = function(e) {
	if (this.scale != 1) { // если масштаб не исходный
		let dx = this.img.scrollLeft() // находим смещение по горизонтали
		let dy = this.img.scrollTop() // находим смещение по вертикали

		return { x: (e.pageX + dx - this.offsetLeft) / this.scale, y: (e.pageY + dy - this.offsetTop) / this.scale } // возвращаем машстабированную точку
	}

	return { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop } // возвращаем обычную точку
}

// создание bbox'а по начальной и конечной точкам и метки
Labeler.prototype.get_box = function(startPoint, endPoint, label = "") {
	// находим левую верхную точку
	x = Math.min(startPoint.x, endPoint.x)
	y = Math.min(startPoint.y, endPoint.y)

	// находим размеры bbox'а
	width = Math.abs(startPoint.x - endPoint.x)
	height = Math.abs(startPoint.y - endPoint.y)

	// возвращаем полученный bbox
	return { 
		label: label,
		x: x,
		y: y,
		width: width,
		height: height
	}
}

// проверка наличия bbox'а под точкой (x, y)
Labeler.prototype.is_box_under_point = function(box, x, y) {
	return (x >= box.x + this.diff && y >= box.y + this.diff && x <= box.x + box.width - this.diff && y <= box.y + box.height - this.diff)
}

// получение растояния от точки до центра bbox'а, умноженного на его площадь
Labeler.prototype.get_box_distance = function(index, x, y) {
	let box = this.entities[index] // получаем переданный bbox

	// находим смещения по координатам
	let dx = x - box.x - box.width / 2
	let dy = y - box.y - box.height / 2

	return Math.sqrt(dx*dx + dy*dy) * (box.width * box.height) // возвращаем расстояние
}

// получение bbox'а под заданной точкой
Labeler.prototype.get_box_index = function(x, y) {
	let indexes = [] // создаём массив подходящих bbox'ов

	// формируем массив подходящих bbox'ов
	for (let i = 0; i < this.entities.length; i++)
		if (this.is_box_under_point(this.entities[i], x, y))
			indexes.push(i)

	// если не нашлось ни одного bbox'а
	if (indexes.length == 0)
		return -1 // возвращаем -1

	// ищем среди найденных элементов bbox с наименьшим расстоянием от заданной точки
	let imin = 0
	let min_dst = this.get_box_distance(indexes[0], x, y)

	for (let i = 1; i < indexes.length; i++) {
		let dst = this.get_box_distance(indexes[i], x, y)

		if (dst < min_dst) {
			min_dst = dst
			imin = i
		}
	}

	return indexes[imin] // возвращаем индекс bbox'а с наименьшим расстоянием
}

// проверка наличия линии (x1, y1) (x2, y2) под точкой (x, y)
Labeler.prototype.check_line = function(x, y, x1, y1, x2, y2) {
	if (x1 == x2) // если вертикальная прямая
		return x > x1 - this.diff && x < x1 + this.diff && y >= y1 - this.diff && y <= y2 + this.diff

	if (y1 == y2) // если горизонтальная прямая
		return y > y1 - this.diff && y < y1 + this.diff && x >= x1 - this.diff && x <= x2 + this.diff

	return false // считаем, что это не прямая
}

// получение индекса масштабируемого bbox'а
Labeler.prototype.get_box_resize_index = function(x, y) {
	for (let i = 0; i < this.entities.length; i++) {
		let box = this.entities[i]

		let line1 = this.check_line(x, y, box.x, box.y, box.x, box.y + box.height)
		let line2 = this.check_line(x, y, box.x, box.y, box.x + box.width, box.y)
		let line3 = this.check_line(x, y, box.x + box.width, box.y, box.x + box.width, box.y + box.height)
		let line4 = this.check_line(x, y, box.x, box.y + box.height, box.x + box.width, box.y + box.height)

		if (line1 && line2)
			return { index: i, type: -1 }

		if (line2 && line3)
			return { index: i, type: -2 }

		if (line3 && line4)
			return { index: i, type: -3 }

		if (line1 && line4)
			return { index: i, type: -4 }

		if (line1)
			return { index: i, type: 1 }
			
		if (line2)
			return { index: i, type: 2 }

		if (line3)
			return { index: i, type: 3 }
			
		if (line4)
			return { index: i, type: 4 }
	}

	return null
}

// отображение выделенных объектов
Labeler.prototype.show_entities = function() {
	let image = $('.labeler-image img') // получаем картинку
	let name = image.attr("src") // получаем путь к ней
	let index = name.lastIndexOf('/')

	// если картинка находится в некоторой папке
	if (index > -1)
		name = name.substring(index + 1) // оставляем только имя

	// получаем размеры картинки
	width = image.width()
	height = image.height()

	let tmp = [] // формируем массив отмастабированных объектов

	for (let i = 0; i < this.entities.length; i++) {
		tmp.push({
			label: this.entities[i].label,
			x: Math.max(0, this.entities[i].x / width * this.scale),
			y: Math.max(0, this.entities[i].y / height * this.scale),
			width: Math.min(this.entities[i].width / width * this.scale, 1),
			height: Math.min(this.entities[i].height / height * this.scale, 1),
		})
	}

	$("#entities-data").text(JSON.stringify({ name: name, entities: tmp }, null, "  ")); // отображаем JSON представление объектов
}

// получение цвета объекта по его метке с заданной прозрачностью
Labeler.prototype.get_color = function(label, opacity = false) {
	return "rgba(" + this.colors[this.labels.indexOf(label)] + (opacity ? ", 0.15" : "") + ")"
}

// наведение на bbox
Labeler.prototype.boxes_hover = function(p) {
	let index = this.get_box_index(p.x, p.y) // получаем индекс bbox'а под точкой (p.x, p.y)

	// сбрасываем выделение всех блоков
	for (let i = 0; i < this.entities.length; i++)
		this.entities_boxes[i].css('outline', "2px solid " + this.get_color(this.entities[i].label))

	// если есть блок
	if (index != -1) {
		this.entities_boxes[index].css('outline', "2px dashed #ffbc00") // выделяем его границу
		$("body").css('cursor', "pointer") // и меняем курсор на указатель
		return
	}

	$("body").css('cursor', "default") // сбрасываем курсор

	let resizing = this.get_box_resize_index(p.x, p.y) // ищем bbox'ы для масштабирования

	if (resizing != null) { // если такой нашёлся
		this.entities_boxes[resizing.index].css('outline', "2px dashed #ffbc00") // выделяем его границу

		// меняем курсор в соответствии с типом изменения
		if (resizing.type == -1 || resizing.type == -3)
			$("body").css('cursor', "nwse-resize")
		else if (resizing.type == -2 || resizing.type == -4)
			$("body").css('cursor', "nesw-resize")
		else if (resizing.type == 1 || resizing.type == 3)
			$("body").css('cursor', "w-resize")
		else
			$("body").css('cursor', "s-resize")
	}
}

// начало выбора метки
Labeler.prototype.start_labeling = function() {
	let select = $('<select id="label-select"><option>Select label</option><option>' + this.labels.join("</option><option>") + '</option></select>') // создаём выпадающий список с метками

	select.appendTo(this.currBox) // добавляем его к текущему блоку
	let width = (this.startPoint.x < this.endPoint.x ? select.width() : 0) // получаем ширину выпадающего списка

	// переносим выпадающий список в последнюю добавленную точку
	select.css({
		"position" : "absolute",
		"top" : (this.endPoint.y - Math.min(this.startPoint.y, this.endPoint.y)) * this.scale + "px",
		"left" : (this.endPoint.x - Math.min(this.startPoint.x, this.endPoint.x) - width) * this.scale + "px",
	})

	select.focus() // передаём управление на выпадающий список
	this.isBlocked = true // блокируем управление
	let labeler = this;

	// вызываем заверщение разметки при изменении метки
	select.change(function() {
		labeler.end_labeling(select)
	})

	// добавляем возможность выбора метки по цифровой клавише
	select.keydown(function(e) {
		let option = parseInt(e.key) // получаем опцию

		if (Number.isInteger(option) && option > 0 && option <= labeler.labels.length) { // если клавиша корректна
			select.prop('selectedIndex', option) // изменяем выбранный индекс
			labeler.end_labeling(select) // и завершаем разметку
		}
	})
}

// завершение разметки
Labeler.prototype.end_labeling = function(select) {
	let label = select.val() // получаем выбранную метку

	this.currBox.css("background", this.get_color(label, true)) // задаём цвет фона блока по выбранной метке
	this.currBox.css("outline", "2px solid " + this.get_color(label)) // задаём внешнюю границу по цвету метки

	let text = $("<p>" + label + "</p>") // создаём текст с меткой в центр блока сверху
	text.css({
		"position" : "relative",
		"text-align" : "center",
		"margin" : "0",
		"color" : this.get_color(label)
	})

	select.remove() // удаляем выпадающий список
	text.appendTo(this.currBox) // добавляем текст к блоку

	this.entities.push(this.get_box(this.startPoint, this.endPoint, label)) // добавляем bbox к массиву объектов
	this.entities_boxes.push(this.currBox) // добавляем блок к массиву блоков

	this.startPoint = null // сбрасываем стартовую точку
	this.endPoint = null // сбрасываем конечную точку
	this.isBlocked = false // разблокируем управление
	this.show_entities() // отображаем выделенные объекты
}

// проверка точки на корректность
Labeler.prototype.is_valid = function(p) {
	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()
	let dst = this.moveIndex == -1 && this.resizeIndex == -1 ? this.diff : 0; // дополнительное расстояние

	return (p.x >= -dst && p.y >= -dst && p.x < imageWidth / this.scale + dst && p.y < imageHeight / this.scale + dst) // точка корректна, если находится внутри изображения
}

// удаленеие всех выделенных объектов
Labeler.prototype.remove_all = function() {
	if (this.entities.length == 0 || !confirm("Remove all: are you sure?"))
		return; // выходим, если нет меток или не подтвердили управление

	// удаляем каждый из блоков
	for (let i = 0; i < this.entities_boxes.length; i++)
		this.entities_boxes[i].remove()
	
	this.entities = [] // очищаем массив выделенных объектов
	this.entities_boxes = [] // очищаем массив выделенных блоков
	this.show_entities() // отображаем объекты
}

// обработка нажатия клавиши мыши
Labeler.prototype.mousedown = function(e) {
	if (this.isBlocked) // игнорируем, если заблокировано управление
		return

	let p = this.get_point(e) // получаем точку

	if (!this.is_valid(p)) // игнорируем некорректную точку
		return

	let index = this.get_box_index(p.x, p.y) // получаем индекс bbox'а
	let resizing = this.get_box_resize_index(p.x, p.y) // получаем масштабируемый блок

	// если левая кнопка
	if (e.button == 0) {
		if (index == -1 && resizing == null) { // если не перемещение и не масштабирование
			this.startPoint = { x: p.x, y: p.y } // формируем стартовую точку
			this.currBox = $('<div class="label-box" draggable=false></div>') // создаём новый блок
			this.currBox.appendTo(this.img) // добавляем блок к изображению
			this.moveIndex = -1 // сбрасываем перемещение
		}
		else if (index != -1) { // если нажали на bbox
			this.movePoint = { x: p.x, y: p.y } // запоминаем перемещаемую точку
			this.currBox = this.entities_boxes[index] // запоминаем выбранный bbox
			this.moveIndex = index // запоминаем его индекс
		}
		else {
			this.resizePoint = { x: p.x, y: p.y } // запоминаем машстабируемую точку
			this.currBox = this.entities_boxes[resizing.index] // запоминаем выбранный bbox
			this.resizeIndex = resizing.index // запоминаем индекс выбранного bbox'а
			this.resizeType = resizing.type // запоминаем тип масштабирования
		}
	}
	else if (e.button == 2) { // если нажата правая кнопка
		if (index == -1 && resizing != null) // если масштабирование
			index = resizing.index // получаем индекс блока

		if (index == -1) // если нет блока
			return // выходим

		this.entities_boxes[index].remove() // удаляем блок
		this.entities.splice(index, 1) // удаляем блок из массива объектов
		this.entities_boxes.splice(index, 1) // удаляем блок из массива блоков
	}

	this.show_entities() // отображаем сущности
}

// отпускание клавиши мыши
Labeler.prototype.mouseup = function(e) {
	if (e.button != 0) // игнорируем, если не левая кнопка
		return

	// если управление заблокировано
	if (this.isBlocked) {
		if (e.target.tagName != "SELECT" && e.target.tagName != "OPTION") { // если выбран не выпадающий список
			this.currBox.remove() // удаляем текущий блок
			this.startPoint = null // сбрасываем начальную точку
			this.endPoint = null // сбрасываем конечную точку
			this.isBlocked = false // разблокируем управление
		}

		return
	}

	// если есть начальная точка и сейчас не перемещение и не масштабирование
	if (this.startPoint != null && this.moveIndex == -1 && this.resizeIndex == -1) {
		this.endPoint = this.get_point(e) // получаем конечную точку

		// получаем размеры изображения
		let imageWidth = $(".labeler-image img").width()
		let imageHeight = $(".labeler-image img").height()

		// нормализуем координаты точек
		if (this.endPoint.x > imageWidth / this.scale)
			this.endPoint.x = imageWidth / this.scale

		if (this.endPoint.y > imageHeight / this.scale)
			this.endPoint.y = imageHeight / this.scale

		// находим размеры созданного bbox'а
		let width = Math.abs(this.startPoint.x - this.endPoint.x)
		let height = Math.abs(this.startPoint.y - this.endPoint.y)

		// если добавленный блок меньше границы реагирования
		if (width < this.diff || height < this.diff) {
			this.currBox.remove() // удаляем блок
			this.startPoint = null // сбрасываем начальную точку
			this.endPoint = null // сбрасываем конечную точку
			return
		}

		this.start_labeling() // начинаем разметку
	}

	this.moveIndex = -1 // сбрасываем индекс перемещения
	this.resizeIndex = -1 // сбрасываем индекс масштабирования
	this.show_entities() // отображаем сущности
}

// перемещение курсора мыши
Labeler.prototype.mousemove = function(e) {
	if (this.isBlocked) // игнорируем, если управление заблокировано
		return

	let p = this.get_point(e) // получаем точку

	// если нет начальной точки и не перемещение и не масштабирование
	if (this.startPoint == null && this.moveIndex == -1 && this.resizeIndex == -1) {
		this.boxes_hover(p) // обрабатываем наведение на блоки
		return
	}

	// игнорируем, если перемещение или масштабрования и точка некорректна
	if ((this.moveIndex > -1 || this.resizeIndex > -1) && !this.is_valid(p))
		return

	// получаем размеры картинки
	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()
	let box = null

	// если перемещение блока
	if (this.moveIndex > -1) {
		// находим смещение от предыдущей точки
		let dx = p.x - this.movePoint.x
		let dy = p.y - this.movePoint.y

		// обновляем точку перемещения
		this.movePoint.x = p.x
		this.movePoint.y = p.y

		// получаем блок и смещаем его на полученное смещение
		box = this.entities[this.moveIndex]
		box.x += dx
		box.y += dy
	}
	else if (this.resizeIndex > -1) { // если масштабирование блока
		// находим смещение от предыдущей точки
		let dx = p.x - this.resizePoint.x
		let dy = p.y - this.resizePoint.y

		// обновляем точку масштабирования
		this.resizePoint.x = p.x
		this.resizePoint.y = p.y

		box = this.entities[this.resizeIndex] // получаем блок

		// в зависимости от типа масштабирования обрабатываем изменения координат и размеров
		if (this.resizeType == 1 || this.resizeType == -1  || this.resizeType == -4) {
			box.x += dx
			box.width -= dx
		}

		if (this.resizeType == 2 || this.resizeType == -1 || this.resizeType == -2) {
			box.y += dy
			box.height -= dy
		}

		if (this.resizeType == 3 || this.resizeType == -2 || this.resizeType == -3) {
			box.width += dx
		}

		if (this.resizeType == 4 || this.resizeType == -3 || this.resizeType == -4) {
			box.height += dy
		}

		// обновляем тип масштабирования, если перешли границы по размерам
		if (box.height < 1) {
			if (this.resizeType == 2)
				this.resizeType = 4
			else if (this.resizeType == 4)
				this.resizeType = 2
			else if (this.resizeType == -3)
				this.resizeType = -2
			else if (this.resizeType == -2)
				this.resizeType = -3
			else if (this.resizeType == -1)
				this.resizeType = -4
			else if (this.resizeType == -4)
				this.resizeType = -1
		}

		if (box.width < 1) {
			if (this.resizeType == 3)
				this.resizeType = 1
			else if (this.resizeType == 1)
				this.resizeType = 3
			else if (this.resizeType == -1)
				this.resizeType = -2
			else if (this.resizeType == -2)
				this.resizeType = -1
			else if (this.resizeType == -3)
				this.resizeType = -4
			else if (this.resizeType == -4)
				this.resizeType = -3
		}
	}
	else {
		point = { x: p.x, y: p.y } // получаем точку

		if (!this.is_valid(p)) { // если точка некоректна, то делаем её максимально возможной
			if (point.x > imageWidth / this.scale)
				point.x = imageWidth / this.scale;

			if (point.y > imageHeight / this.scale)
				point.y = imageHeight / this.scale;
		}

		box = this.get_box(this.startPoint, point) // получаем bbox по данным точкам
	}

	// обрабатываем некорректные параметры блока
	if (box.y < 0)
		box.y = 0;

	if (box.x < 0)
		box.x = 0;

	if (box.x + box.width > imageWidth / this.scale)
		box.x = imageWidth / this.scale - box.width;

	if (box.y + box.height > imageHeight / this.scale)
		box.y = imageHeight / this.scale - box.height;

	// обновляем стили текущего блока
	this.currBox.css({
		"outline": "2px dotted #ffbc00",
		"position": "absolute",
		"top": box.y * this.scale + "px",
		"left": box.x * this.scale + "px",
		"width": box.width * this.scale + "px",
		"height": box.height * this.scale + "px",
	})
}

// инициализация из выделенных объектов
Labeler.prototype.init_from_entities = function(boxes) {
	this.entities = [] // очищаем массив выделенных объектов
	this.entities_boxes = [] // очищаем массив выделенных блоков

	// получаем размеры изображения
	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()

	// проходимся по переданным блокам
	for (let i = 0; i < boxes.length; i++) {
		this.entities.push({
			label : boxes[i].label,
			x : Math.floor(boxes[i].x * imageWidth),
			y : Math.floor(boxes[i].y * imageHeight),
			width : Math.floor(boxes[i].width * imageWidth),
			height : Math.floor(boxes[i].height * imageHeight) }) // добавляем объект в массив объектов

		let box = $('<div class="label-box" draggable=false></div>') // создаём блок
		
		box.appendTo(this.img) // добавляем блок к картинке и настраиваем его стили
		box.css({
			"outline": "2px solid " + this.get_color(boxes[i].label),
			"position": "absolute",
			"top": boxes[i].y * imageHeight * this.scale + "px",
			"left": boxes[i].x * imageWidth * this.scale + "px",
			"width": boxes[i].width * imageWidth * this.scale + "px",
			"height": boxes[i].height * imageHeight * this.scale + "px",
			"background": this.get_color(boxes[i].label, true)
		})

		let text = $("<p>" + boxes[i].label + "</p>") // создаём текст по центру блока сверху
		text.css({
			"position" : "relative",
			"text-align" : "center",
			"margin" : "0",
			"color" : this.get_color(boxes[i].label)
		})

		text.appendTo(box) // добавляем текст к блоку
		this.entities_boxes.push(box) // добавляем блок к массиву блоков
	}

	this.show_entities() // отображаем выделенные объекты
}

// нажатие клавиши на клавиатуре
Labeler.prototype.keydown = function(e) {
	if (e.key == "+" || e.key == "=" || e.key == "-") { // если нажаты клавиши + или -
		if (e.key == "+" || e.key == "=")
			this.scale = Math.min(4, this.scale * this.scale_value); // увеличиваем масштаб
		else
			this.scale = Math.max(1.0 / this.scale_value, this.scale / this.scale_value); // уменьшаем масштаб

		$(".labeler-image img").css("width", (this.scale * 100) + "%") // обновляем стиль для изображения

		// обновляем стили блоков
		for (let i = 0; i < this.entities_boxes.length; i++) {
			this.entities_boxes[i].css({
				"left" : this.entities[i].x * this.scale,
				"top" : this.entities[i].y * this.scale,
				"width" : this.entities[i].width * this.scale,
				"height" : this.entities[i].height * this.scale,
			})
		}
	}
}