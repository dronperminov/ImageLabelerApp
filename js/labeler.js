function Labeler(labels, colors) {
	this.diff = $(window).innerWidth() < 767 ? 15 : 5

	this.labels = labels
	this.colors = colors

	this.startPoint = null
	this.endPoint = null
	this.currBox = null
	this.entities = []
	this.entities_boxes = []

	this.moveIndex = -1
	this.movePoint = null

	this.resizeIndex = -1
	this.resizeType = null
	this.resizePoint = null

	this.isBlocked = false

	this.img = $('.labeler-image')

	this.scale_value = 2
	this.scale = 1

	this.offsetLeft = this.img.offset().left
	this.offsetTop = this.img.offset().top

	this.initialize()
}

Labeler.prototype.initialize = function() {
	let labeler = this

	$(document).mousedown(function(e) { labeler.mousedown(e) })
	$(document).mouseup(function(e) { labeler.mouseup(e) })
	$(document).mousemove(function(e) { labeler.mousemove(e) })
	$(document).keydown(function(e) { labeler.keydown(e) })

	$(document).on("touchstart", function(e) {
		if (!$("#mode-box").is(":checked"))
			return

		if (e.originalEvent.touches.length > 2)
			return

		if (e.originalEvent.touches.length == 1)
			e.originalEvent.targetTouches[0].button = 0
		else
			e.originalEvent.targetTouches[0].button = 2

		labeler.mousedown(e.originalEvent.targetTouches[0])
	})

	$(document).on("touchend", function(e) {
		if (!$("#mode-box").is(":checked"))
			return

		if (e.originalEvent.changedTouches.length == 1) {
			e.originalEvent.changedTouches[0].button = 0
			labeler.mouseup(e.originalEvent.changedTouches[0])
		}
	})

	document.addEventListener("touchmove", function(e) {
		if (!$("#mode-box").is(":checked"))
			return

		if (e.changedTouches.length == 1) {
			labeler.mousemove(e.changedTouches[0])
			e.preventDefault()
			return false
		}
	}, { passive: false })

	$(document).on("dragstart", function(e) {
		if (e.target.nodeName.toUpperCase() == "IMG")
			return false;
	});

	$("#reset-btn").click(function(e) {
		labeler.remove_all()
	})

	$("#mode-box").css("top", labeler.img.offset().top + "px")

	this.show_entities()
}

Labeler.prototype.get_point = function(e) {
	if (this.scale != 1) {
		let dx = this.img.scrollLeft()
		let dy = this.img.scrollTop()

		return { x: (e.pageX + dx - this.offsetLeft) / this.scale, y: (e.pageY + dy - this.offsetTop) / this.scale }
	}
	return { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop }
}

Labeler.prototype.get_box = function(startPoint, endPoint, label = "") {
	x = Math.min(startPoint.x, endPoint.x)
	y = Math.min(startPoint.y, endPoint.y)

	width = Math.abs(startPoint.x - endPoint.x)
	height = Math.abs(startPoint.y - endPoint.y)

	return { 
		label: label,
		x: x,
		y: y,
		width: width,
		height: height
	}
}

Labeler.prototype.is_box_under_point = function(box, x, y) {
	return (x >= box.x + this.diff && y >= box.y + this.diff && x <= box.x + box.width - this.diff && y <= box.y + box.height - this.diff)
}

Labeler.prototype.get_box_distance = function(index, x, y) {
	let box = this.entities[index]

	let dx = x - box.x - box.width / 2
	let dy = y - box.y - box.height / 2

	return Math.sqrt(dx*dx + dy*dy) * (box.width * box.height)
}

Labeler.prototype.get_box_index = function(x, y) {
	let indexes = []
	for (let i = 0; i < this.entities.length; i++)
		if (this.is_box_under_point(this.entities[i], x, y))
			indexes.push(i)

	if (indexes.length == 0)
		return -1

	let imin = 0
	let min_dst = this.get_box_distance(indexes[0], x, y)

	for (let i = 1; i < indexes.length; i++) {
		let dst = this.get_box_distance(indexes[i], x, y)

		if (dst < min_dst) {
			min_dst = dst
			imin = i
		}
	}

	return indexes[imin]
}

Labeler.prototype.check_line = function(x, y, x1, y1, x2, y2) {
	if (x1 == x2)
		return x > x1 - this.diff && x < x1 + this.diff && y >= y1 - this.diff && y <= y2 + this.diff

	if (y1 == y2)
		return y > y1 - this.diff && y < y1 + this.diff && x >= x1 - this.diff && x <= x2 + this.diff

	return false
}

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

Labeler.prototype.show_entities = function() {
	let image = $('.labeler-image img')
	let name = image.attr("src")
	let index = name.lastIndexOf('/')

	if (index > -1)
		name = name.substring(index)

	width = image.width()
	height = image.height()

	let tmp = []

	for (let i = 0; i < this.entities.length; i++) {
		tmp.push({
			label: this.entities[i].label,
			x: Math.max(0, this.entities[i].x / width * this.scale),
			y: Math.max(0, this.entities[i].y / height * this.scale),
			width: Math.min(this.entities[i].width / width * this.scale, 1),
			height: Math.min(this.entities[i].height / height * this.scale, 1),
		})
	}

	$("#entities-data").text(JSON.stringify({ name: name, entities: tmp }, null, "  "));
}

Labeler.prototype.get_color = function(label, opacity = false) {
	return "rgba(" + this.colors[this.labels.indexOf(label)] + (opacity ? ", 0.15" : "") + ")"
}

Labeler.prototype.boxes_hover = function(p) {
	let index = this.get_box_index(p.x, p.y)

	for (let i = 0; i < this.entities.length; i++)
		this.entities_boxes[i].css('outline', "2px solid " + this.get_color(this.entities[i].label))

	if (index != -1) {
		this.entities_boxes[index].css('outline', "2px dashed #ffbc00")
		$("body").css('cursor', "pointer")
		return
	}

	$("body").css('cursor', "default")

	let resizing = this.get_box_resize_index(p.x, p.y)

	if (resizing != null) {
		this.entities_boxes[resizing.index].css('outline', "2px dashed #ffbc00")

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

Labeler.prototype.start_labeling = function() {
	let select = $('<select id="label-select"><option>Select label</option><option>' + this.labels.join("</option><option>") + '</option></select>')

	select.appendTo(this.currBox)
	let width = (this.startPoint.x < this.endPoint.x ? select.width() : 0)

	select.css({
		"position" : "absolute",
		"top" : (this.endPoint.y - Math.min(this.startPoint.y, this.endPoint.y)) * this.scale + "px",
		"left" : (this.endPoint.x - Math.min(this.startPoint.x, this.endPoint.x) - width) * this.scale + "px",
	})

	select.focus()
	this.isBlocked = true
	let labeler = this;

	select.change(function() {
		labeler.end_labeling(select)
	})

	select.keydown(function(e) {
		let option = parseInt(e.key)

		if (Number.isInteger(option) && option > 0 && option <= labeler.labels.length) {
			select.prop('selectedIndex', option)
			labeler.end_labeling(select)
		}
	})
}

Labeler.prototype.end_labeling = function(select) {
	let label = select.val()

	this.currBox.css("background", this.get_color(label, true))
	this.currBox.css("outline", "2px solid " + this.get_color(label))

	let text = $("<p>" + label + "</p>")
	text.css({
		"position" : "relative",
		"text-align" : "center",
		"margin" : "0",
		"color" : this.get_color(label)
	})

	select.remove()
	text.appendTo(this.currBox)

	this.entities.push(this.get_box(this.startPoint, this.endPoint, label))
	this.entities_boxes.push(this.currBox)

	this.startPoint = null
	this.endPoint = null
	this.isBlocked = false
	this.show_entities()
}

Labeler.prototype.is_valid = function(p) {
	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()
	let dst = this.moveIndex == -1 && this.resizeIndex == -1 ? this.diff : 0;

	if (p.x < -dst || p.y < -dst || p.x > imageWidth / this.scale + dst || p.y > imageHeight / this.scale + dst)
		return false

	return true
}

Labeler.prototype.remove_all = function() {
	if (this.entities.length > 0 && confirm("Remove all: are you sure?")) {
		for (let i = 0; i < this.entities_boxes.length; i++)
			this.entities_boxes[i].remove()

		this.entities = []
		this.entities_boxes = []
		this.show_entities()
	}
}

Labeler.prototype.mousedown = function(e) {
	if (this.isBlocked)
		return

	let p = this.get_point(e)

	if (!this.is_valid(p))
		return

	let index = this.get_box_index(p.x, p.y)
	let resizing = this.get_box_resize_index(p.x, p.y)

	if (e.button == 0) {
		if (index == -1 && resizing == null) {
			this.startPoint = { x: p.x, y: p.y }
			this.currBox = $('<div class="label-box" draggable=false></div>')
			this.currBox.appendTo(this.img)
			this.moveIndex = -1
		}
		else if (index != -1) {
			this.movePoint = { x: p.x, y: p.y }
			this.currBox = this.entities_boxes[index]
			this.moveIndex = index
		}
		else {
			this.resizePoint = { x: p.x, y: p.y }
			this.currBox = this.entities_boxes[resizing.index]
			this.resizeIndex = resizing.index
			this.resizeType = resizing.type
		}
	}
	else if (e.button == 2) {
		if (index == -1 && resizing != null)
			index = resizing.index

		if (index == -1)
			return

		this.entities_boxes[index].remove()
		this.entities.splice(index, 1)
		this.entities_boxes.splice(index, 1)
	}

	this.show_entities()
}

Labeler.prototype.mouseup = function(e) {
	if (e.button != 0)
		return

	if (this.isBlocked) {
		if (e.target.tagName != "SELECT" && e.target.tagName != "OPTION") {
			this.currBox.remove()
			this.startPoint = null
			this.endPoint = null
			this.isBlocked = false
		}

		return
	}

	if (this.startPoint != null && this.moveIndex == -1 && this.resizeIndex == -1) {
		this.endPoint = this.get_point(e)

		let imageWidth = $(".labeler-image img").width()
		let imageHeight = $(".labeler-image img").height()

		if (this.endPoint.x > imageWidth / this.scale)
			this.endPoint.x = imageWidth / this.scale

		if (this.endPoint.y > imageHeight / this.scale)
			this.endPoint.y = imageHeight / this.scale

		let width = Math.abs(this.startPoint.x - this.endPoint.x)
		let height = Math.abs(this.startPoint.y - this.endPoint.y)

		if (width < this.diff || height < this.diff) {
			this.currBox.remove()
			this.startPoint = null
			this.endPoint = null
			return
		}

		this.start_labeling()
	}

	this.moveIndex = -1
	this.resizeIndex = -1
	this.show_entities()
}

Labeler.prototype.mousemove = function(e) {
	if (this.isBlocked)
		return

	let p = this.get_point(e)

	if (this.startPoint == null && this.moveIndex == -1 && this.resizeIndex == -1) {
		this.boxes_hover(p)
		return
	}

	if ((this.moveIndex > -1 || this.resizeIndex > -1) && !this.is_valid(p))
		return

	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()
	let box = null

	if (this.moveIndex > -1) {
		let dx = p.x - this.movePoint.x
		let dy = p.y - this.movePoint.y

		this.movePoint.x = p.x
		this.movePoint.y = p.y

		box = this.entities[this.moveIndex]
		box.x += dx
		box.y += dy
	}
	else if (this.resizeIndex > -1) {
		let dx = p.x - this.resizePoint.x
		let dy = p.y - this.resizePoint.y

		this.resizePoint.x = p.x
		this.resizePoint.y = p.y

		box = this.entities[this.resizeIndex]

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
		point = { x: p.x, y: p.y }

		if (!this.is_valid(p)) {
			if (point.x > imageWidth / this.scale)
				point.x = imageWidth / this.scale;

			if (point.y > imageHeight / this.scale)
				point.y = imageHeight / this.scale;
		}

		box = this.get_box(this.startPoint, point)
	}

	if (box.y < 0)
		box.y = 0;

	if (box.x < 0)
		box.x = 0;

	if (box.x + box.width > imageWidth / this.scale)
		box.x = imageWidth / this.scale - box.width;

	if (box.y + box.height > imageHeight / this.scale)
		box.y = imageHeight / this.scale - box.height;

	this.currBox.css({
		"outline": "2px dotted #ffbc00",
		"position": "absolute",
		"top": box.y * this.scale + "px",
		"left": box.x * this.scale + "px",
		"width": box.width * this.scale + "px",
		"height": box.height * this.scale + "px",
	})
}

Labeler.prototype.init_from_entities = function(boxes) {
	this.entities = []
	this.entities_boxes = []

	let imageWidth = $(".labeler-image img").width()
	let imageHeight = $(".labeler-image img").height()

	for (let i = 0; i < boxes.length; i++) {
		this.entities.push({
			label : boxes[i].label,
			x : Math.floor(boxes[i].x * imageWidth),
			y : Math.floor(boxes[i].y * imageHeight),
			width : Math.floor(boxes[i].width * imageWidth),
			height : Math.floor(boxes[i].height * imageHeight) })

		let box = $('<div class="label-box" draggable=false></div>')
		
		box.appendTo(this.img)
		box.css({
			"outline": "2px solid " + this.get_color(boxes[i].label),
			"position": "absolute",
			"top": boxes[i].y * imageHeight * this.scale + "px",
			"left": boxes[i].x * imageWidth * this.scale + "px",
			"width": boxes[i].width * imageWidth * this.scale + "px",
			"height": boxes[i].height * imageHeight * this.scale + "px",
			"background": this.get_color(boxes[i].label, true)
		})

		let text = $("<p>" + boxes[i].label + "</p>")
		text.css({
			"position" : "relative",
			"text-align" : "center",
			"margin" : "0",
			"color" : this.get_color(boxes[i].label)
		})

		text.appendTo(box)
		this.entities_boxes.push(box)
	}

	this.show_entities()
}

Labeler.prototype.keydown = function(e) {
	if (e.key == "+" || e.key == "=" || e.key == "-") {
		if (e.key == "+" || e.key == "=")
			this.scale = Math.min(4, this.scale * this.scale_value);
		else
			this.scale = Math.max(1.0 / this.scale_value, this.scale / this.scale_value);

		$(".labeler-image img").css("width", (this.scale * 100) + "%")

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