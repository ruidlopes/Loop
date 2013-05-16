// Loop - Audio loop recording/playing/slicing.
// Copyright (c) Rui Lopes 2013
// Contact: ruidlopes@gmail.com
// MIT-style license.

var namespace = function(ns) {
  for (var scope = window, names = ns.split('.'), name;
      name = names.shift();
      scope = scope[name]) {
    scope[name] = scope[name] || {};
  }
};

namespace('lib');
lib.inherits = function(child, base) {
  child.prototype = Object.create(base.prototype);
};

namespace('lib.functions');
lib.functions.error = function(value, opt_exception) {
  if (opt_exception) {
    opt_exception.originalMessage = value;
    opt_exception.message = value;
    throw opt_exception;
  } else {
    throw new Error(value);
  }
};
lib.functions.constant = function(value) {
  return function() {
    return value;
  };
};
lib.functions.EMPTY = lib.functions.constant();
lib.functions.TRUE = lib.functions.constant(true);
lib.functions.FALSE = lib.functions.constant(false);

namespace('lib.assert');
lib.assert.exists = function(thing, opt_msg) {
  if (thing === undefined || thing === null) {
    lib.functions.error(opt_msg || 'Value does not exist.');
  };
};

lib.assert.undefined = function(condition, opt_msg) {
  if (condition !== undefined) {
    lib.functions.error(opt_msg || 'Value is defined.');
  }
};

lib.assert.true = function(condition, opt_msg) {
  if (condition !== true) {
    lib.functions.error(opt_msg || 'Value is not strictly true.');
  }
};

lib.assert.false = function(condition, opt_msg) {
  if (condition !== false) {
    lib.functions.error(opt_msg || 'Value is not strictly false.');
  }
};


namespace('lib.binary');
lib.binary.uint16 = function(value) {
  return new Uint8Array([
      0xff & value >> 8,
      0xff & value
  ]);
};

lib.binary.uint32 = function(value) {
  return new Uint8Array([
      0xff & value >> 24,
      0xff & value >> 16,
      0xff & value >> 8,
      0xff & value
  ]);
};


namespace('lib.msg');
lib.msg.handlers = {};
lib.msg.types = {};

lib.msg.listen = function(msg, handler) {
  lib.assert.true(lib.msg.types[msg], 'Cannot listen to unregistered message type.');
  lib.msg.handlers[msg] = lib.msg.handlers[msg] || [];
  lib.msg.handlers[msg].push(handler);
};

lib.msg.send = function(msg) {
  lib.assert.true(lib.msg.types[msg], 'Cannot send unregistered message type.');
  var args = Array.prototype.slice.call(arguments, 1);
  for (var i = 0, handler; handler = lib.msg.handlers[msg][i++];) {
    handler.apply(null, args);
  };
};

lib.msg.register = function(types) {
  for (var type in types) {
    lib.assert.undefined(lib.msg.types[types[type]], 'Message type already registered.');
    lib.msg.types[types[type]] = true;
  }
};


namespace('lib.threads.Thread');
lib.threads.Thread = function() {
  this.binary = null;
  this.worker = null;
};

// This must be overriden with the core thread code.
lib.threads.Thread.prototype.run = lib.functions.EMPTY;
// And (optionally) this to capture a returning value.
lib.threads.Thread.prototype.result = lib.functions.EMPTY;
// And (optionally) this to handle errors.
lib.threads.Thread.prototype.error = lib.functions.EMPTY;

lib.threads.Thread.prototype.runInternal = function(e) {
  var retFn = 'var __fn = ' + this.run.toString() + ';';
  var msgFn = 'function(e) { var ret = __fn(e.data); postMessage(ret); };';
  return retFn + 'onmessage = ' + msgFn;
};

lib.threads.Thread.prototype.resultInternal = function(e) {
  URL.revokeObjectURL(this.binary);
  this.result(e.data);
};

lib.threads.Thread.prototype.init = function() {
  var compiledCode = new Blob([this.runInternal()]);
  this.binary = URL.createObjectURL(compiledCode);
  this.worker = new Worker(this.binary);
  this.worker.addEventListener('message', this.resultInternal.bind(this), false);
  this.worker.addEventListener('error', this.error.bind(this), false);
};

lib.threads.Thread.prototype.start = function(data) {
  if (!this.worker) {
    this.init();
  }
  this.worker.postMessage(data);
};


namespace('lib.ui');
lib.ui.maestro = null;
lib.ui.canvas = null;
lib.ui.ctx = null;
lib.ui.width = 0;
lib.ui.height = 0;

lib.ui.requestAnimationFrame = (
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame).bind(window);

lib.ui.init = function() {
  lib.ui.canvas = document.querySelector('canvas');
  lib.ui.ctx = lib.ui.canvas.getContext('2d');

  lib.ui.style.parse();
  lib.ui.resize();
  lib.ui.maestro.init();

  (function __loop() {
    lib.ui.requestAnimationFrame(__loop);
    lib.ui.maestro.render();
  })();
};

lib.ui.resize = function() {
  lib.ui.width = lib.ui.canvas.width = document.width;
  lib.ui.height = lib.ui.canvas.height = document.height;
  lib.ui.maestro.resize();
};


namespace('lib.ui.style');
lib.ui.style.defs = {};
lib.ui.style.defRE = /^\s*define\s+\.(.+)/;
lib.ui.style.camelRE = /-([a-z])/g;

lib.ui.style.parse = function() {
  for (var i = 0, stylesheet; stylesheet = document.styleSheets[i++];) {
    lib.ui.style.parseStylesheet(stylesheet);
  }
};

lib.ui.style.parseStylesheet = function(stylesheet) {
  for (var i = 0, rule; rule = stylesheet.cssRules[i++];) {
    lib.ui.style.parseRule(rule);
  }
};

lib.ui.style.parseRule = function(rule) {
  var match = lib.ui.style.defRE.exec(rule.selectorText);
  if (!match) {
    return;
  }
  var def = match[1];
  var camelDef = def.replace(lib.ui.style.camelRE, function(_, letter) {
    return letter.toUpperCase();
  });
  lib.ui.style.defs[camelDef] = rule.style;
};


namespace('lib.ui.Component');
lib.ui.Component = function(id, opt_parent) {
  this.id = id;
  this.element = null;
  this.rect = null;
  this.visible = true;

  this.parent = opt_parent || null;
  this.components = [];

  this.create();
};

lib.ui.Component.prototype.create = function() {
  this.element = document.createElement('div');
  this.element.id = this.id;
  this.element.classList.add('component');

  var parentElement = this.parent ? this.parent.element : document.body;
  parentElement.appendChild(this.element);
};

lib.ui.Component.prototype.addComponent = function(child) {
  if (!child.parent) {
    child.parent = this;
    child.element.parentElement.removeChild(child.element);
    this.element.appendChild(child.element);
  }
  this.components.push(child);
};

lib.ui.Component.prototype.computeRect = function() {
  this.rect = this.element.getBoundingClientRect();
  for (var i = 0, child; child = this.components[i++];) {
    child.computeRect();
  }
};

lib.ui.Component.prototype.isCoordinateWithin = function(x, y) {
  return x >= this.rect.left &&
    x <= this.rect.right &&
    y >= this.rect.top &&
    y <= this.rect.bottom;
};

lib.ui.Component.prototype.tX = function(x) {
  return x - this.rect.left;
};

lib.ui.Component.prototype.tY = function(y) {
  return y - this.rect.top;
};

lib.ui.Component.prototype.renderInternal = function() {
  if (!this.visible) {
    return;
  }

  lib.ui.ctx.save();
  lib.ui.ctx.beginPath();
  lib.ui.ctx.rect(this.rect.left, this.rect.top, this.rect.width, this.rect.height);
  lib.ui.ctx.clip();

  lib.ui.ctx.save();
  lib.ui.ctx.translate(this.rect.left + 0.5, this.rect.top + 0.5);
  this.render();
  lib.ui.ctx.restore();

  lib.ui.ctx.restore();

  for (var i = 0, child; child = this.components[i++];) {
    child.renderInternal();
  }
};

lib.ui.Component.prototype.handleMouseDownInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleMouseDownInternal.bind(child)(e)) {
      return true;
    }
  }
  return this.isCoordinateWithin(e.clientX, e.clientY) &&
    this.handleMouseDown(e, this.tX(e.clientX), this.tY(e.clientY));
};

lib.ui.Component.prototype.handleMouseMoveInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleMouseMoveInternal.bind(child)(e)) {
      return true;
    }
  }
  return this.isCoordinateWithin(e.clientX, e.clientY) &&
    this.handleMouseMove(e, this.tX(e.clientX), this.tY(e.clientY));
};

lib.ui.Component.prototype.handleMouseUpInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleMouseUpInternal.bind(child)(e)) {
      return true;
    }
  }
  return this.isCoordinateWithin(e.clientX, e.clientY) &&
    this.handleMouseUp(e, this.tX(e.clientX), this.tY(e.clientY));
};

lib.ui.Component.prototype.handleClickInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleClickInternal.bind(child)(e)) {
      return true;
    }
  }
  return this.isCoordinateWithin(e.clientX, e.clientY) &&
    this.handleClick(e, this.tX(e.clientX), this.tY(e.clientY));
};

lib.ui.Component.prototype.handleWheelInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleWheelInternal.bind(child)(e)) {
      return true;
    }
  }

  var deltaX = e.deltaX || e.wheelDeltaX;
  var deltaY = e.deltaY || e.wheelDeltaY;
  var ret = this.isCoordinateWithin(e.clientX, e.clientY) &&
    this.handleWheel(e, this.tX(e.clientX), this.tY(e.clientY), deltaX, deltaY);

  e.preventDefault();
  return ret;
};

lib.ui.Component.prototype.handleKeyDownInternal = function(e) {
  if (!this.visible) {
    return;
  }

  for (var i = 0, child; child = this.components[i++];) {
    if (child.handleKeyDownInternal.bind(child)(e)) {
      return true;
    }
  }
  return this.handleKeyDown(e);
};


lib.ui.Component.prototype.init = lib.functions.EMPTY;
lib.ui.Component.prototype.render = lib.functions.EMPTY;
lib.ui.Component.prototype.handleMouseDown = lib.functions.FALSE;
lib.ui.Component.prototype.handleMouseMove = lib.functions.FALSE;
lib.ui.Component.prototype.handleMouseUp = lib.functions.FALSE;
lib.ui.Component.prototype.handleClick = lib.functions.FALSE;
lib.ui.Component.prototype.handleWheel = lib.functions.FALSE;
lib.ui.Component.prototype.handleKeyDown = lib.functions.FALSE;


namespace('lib.ui.Viewport');
lib.ui.Viewport = function(id, opt_parent) {
  lib.ui.Component.call(this, id, opt_parent);

  this.viewportX = 0;
  this.viewportY = 0;
  this.viewportEnabled = false;
};
lib.inherits(lib.ui.Viewport, lib.ui.Component);

lib.ui.Viewport.prototype.handleWheel = function(e, tx, ty, wheelX, wheelY) {
  if (!this.viewportEnabled) {
    return false;
  }
  this.viewportX = Math.max(0, this.viewportX - wheelX);
  this.viewportY = Math.max(0, this.viewportY - wheelY);
  return true;
};

lib.ui.Viewport.prototype.viewportTranslateX = function(x) {
  return this.viewportEnabled ? this.viewportX + x : x;
};

lib.ui.Viewport.prototype.viewportTranslateY = function(y) {
  return this.viewportEnabled ? this.viewportY + y : y;
};


namespace('lib.ui.Button');
lib.ui.Button = function(id, text, opt_parent) {
  lib.ui.Component.call(this, id, opt_parent);

  this.text = text;
};
lib.inherits(lib.ui.Button, lib.ui.Component);

lib.ui.Button.create = function(id, text, handler) {
  var button = new lib.ui.Button(id, text);
  button.handleClick = handler;
  return button;
};

lib.ui.Button.prototype.render = function() {
  lib.ui.ctx.font = lib.ui.style.defs.button.font;
  lib.ui.ctx.textAlign = 'center';
  lib.ui.ctx.textBaseline = 'middle';
  lib.ui.ctx.fillStyle = lib.ui.style.defs.itemStandby.color;
  lib.ui.ctx.fillText(this.text, this.rect.width * 0.5, this.rect.height * 0.5);
};


namespace('lib.ui.Maestro');
lib.ui.Maestro = function() {
  this.root = null;
};

lib.ui.Maestro.prototype.clear = function() {
  lib.ui.ctx.save();
  lib.ui.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lib.ui.ctx.clearRect(0, 0, lib.ui.width, lib.ui.height);
  lib.ui.ctx.restore();
};

lib.ui.Maestro.prototype.init = function() {
  lib.assert.exists(this.root, 'UI root not defined.');
  this.root.init();
};

lib.ui.Maestro.prototype.resize = function() {
  lib.assert.exists(this.root, 'UI root not defined.');
  this.root.computeRect();
};

lib.ui.Maestro.prototype.render = function() {
  lib.assert.exists(this.root, 'UI root not defined.');

  this.clear();
  this.root.renderInternal();
};

lib.ui.Maestro.prototype.addEventListener = function(eventType, handler) {
  window.addEventListener(eventType, handler.bind(this.root));
};

lib.ui.Maestro.prototype.addEventListeners = function() {
  lib.assert.exists(this.root, 'UI root not defined.');

  this.addEventListener('mousedown', this.root.handleMouseDownInternal);
  this.addEventListener('mousemove', this.root.handleMouseMoveInternal);
  this.addEventListener('mouseup', this.root.handleMouseUpInternal);
  this.addEventListener('click', this.root.handleClickInternal);

  this.addEventListener('mousewheel', this.root.handleWheelInternal);
  this.addEventListener('wheel', this.root.handleWheelInternal);

  this.addEventListener('keydown', this.root.handleKeyDownInternal);
};


namespace('loop.audio.msg');
loop.audio.msg = {
  SCROLL_TO_BEGINNING: 0x00000001
};
lib.msg.register(loop.audio.msg);

namespace('loop.audio.SampleProcessThread');
loop.audio.SampleProcessThread = function(externalResult) {
  lib.threads.Thread.call(this);
  this.externalResult = externalResult;
};
lib.inherits(loop.audio.SampleProcessThread, lib.threads.Thread);

loop.audio.SampleProcessThread.prototype.run = function(data) {
  var index = data.index;
  var sample = data.sample;
  var leftAverage = 0;
  var rightAverage = 0;

  for (var i = 0, inv = 1, len = sample.length; i < len; i++, inv = 1 / i) {
    leftAverage += (sample[i] - leftAverage) * inv;
  }
  return {
    index: index,
    left: leftAverage,
    right: rightAverage
  };
};

loop.audio.SampleProcessThread.prototype.result = function(data) {
  this.externalResult(data.index, data.left, data.right);
};


namespace('loop.audio.Sample');
loop.audio.Sample = function(index, sample) {
  this.index = index;
  this.sample = sample;
  this.leftAverage = 0;
  this.rightAverage = 0;
};

loop.audio.Sample.prototype.update = function(index, left, right) {
  this.index = index;
  this.leftAverage = left;
  this.rightAverage = right;
};


namespace('loop.audio.Encoder');
loop.audio.Encoder = function(type) {
  this.type = type;
  this.blob = null;
};

loop.audio.Encoder.prototype.asDataUrl = function(callback) {
  lib.assert.exists(this.blob, 'Encoder blob not created.');

  // TODO: revoke the object URL asynchronously.
  callback(URL.createObjectURL(this.blob));
};

loop.audio.Encoder.prototype.asBinaryString = function(callback) {
  lib.assert.exists(this.blob, 'Encoder blob not created.');

  var reader = new FileReader();
  reader.onload = function() {
    callback(reader.result);
  };
  reader.readAsBinaryString();
};

loop.audio.Encoder.prototype.encode = function(samples, init, end) {
  this.blob = new Blob(this.computeParts(samples, init, end), {type: this.type});
};

loop.audio.Encoder.prototype.computeParts = lib.functions.constant([]);


namespace('loop.audio.AiffEncoder');
loop.audio.AiffEncoder = function() {
  loop.audio.Encoder.call(this, 'audio/aiff');
};
lib.inherits(loop.audio.AiffEncoder, loop.audio.Encoder);

loop.audio.AiffEncoder.prototype.computeParts = function(samples, init, end) {
  // Based on http://muratnkonar.com/aiff/index.html
  var parts = [];

  var samplesCount = end - init;

  var commChunkSize = 18;
  var commSize = 4 + 4 + commChunkSize;

  // samples * 512 frames  * 32 bit + 8 padding bytes (offset, blockSize)
  var ssndChunkSize = samplesCount * 512 * 4 + 8;
  var ssndSize = 4 + 4 + ssndChunkSize;

  // sizeof(COMM) + sizeof(SSND)
  var fileSize = commSize + ssndSize;

  // Header
  parts.push('FORM');
  // COMM + all SSND
  parts.push(lib.binary.uint32(fileSize));
  parts.push('AIFF');

  // Common Chunk
  parts.push('COMM');
  // 18 bytes in this chunk
  parts.push(lib.binary.uint32(commChunkSize));
  // Mono
  parts.push(lib.binary.uint16(1));
  // # frames = samples * 512 entries per sample / mono
  parts.push(lib.binary.uint32(samplesCount * 512 / 1));
  // 32 bits per sample
  parts.push(lib.binary.uint16(32));
  // Sample rate, 44100 (80-bit IEEE encoding)
  parts.push(new Uint8Array([0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // Sound Data Chunk
  parts.push('SSND');
  // Lots of bytes in this chunk
  parts.push(lib.binary.uint32(ssndChunkSize));
  // Offset (always zero)
  parts.push(lib.binary.uint32(0));
  // Block size (always zero)
  parts.push(lib.binary.uint32(0));

  for (var i = 0; i < samplesCount; ++i) {
    // Recorded samples
    parts.push(this.computeSample(samples[i + init].sample));
  }

  return parts;
};

loop.audio.AiffEncoder.prototype.computeSample = function(sample) {
  var output = new Uint8Array(sample.length * 4);

  for (var i = 0; i < sample.length; ++i) {
    // Two's complement conversion between [-1, 1] and 32-bit signed int.
    var value = Math.floor((Math.pow(2, 30) - 1) * (1 + sample[i]));
    output[i * 4 + 0] = 0xff & value >> 24;
    output[i * 4 + 1] = 0xff & value >> 16;
    output[i * 4 + 2] = 0xff & value >> 8;
    output[i * 4 + 3] = 0xff & value;
  }

  return output;
};


namespace('loop.audio.Looper');
loop.audio.Looper = function() {
  lib.ui.Viewport.call(this, 'looper');

  this.thread = null;
  this.samples = [];
  this.encoder = new loop.audio.AiffEncoder();

  this.gain = loop.audio.core.context.createGain();
  this.gain.gain.value = 5.0;

  this.recorder = loop.audio.core.context.createScriptProcessor(512, 1, 1);
  this.recorder.onaudioprocess = this.onAudioRecord.bind(this);
  this.isRecording = false;

  this.player = loop.audio.core.context.createScriptProcessor(512, 0, 1);
  this.player.onaudioprocess = this.onAudioPlayback.bind(this);
  this.isPlaying = false;
  this.playerPosition = 0;

  this.useSelection = false;
  this.selectionMin = 0;
  this.selectionMax = 0;

  this.handlingSelection = false;
  this.handlingInit = -1;
  this.handlingEnd = -1;
};
lib.inherits(loop.audio.Looper, lib.ui.Viewport);

loop.audio.Looper.prototype.init = function() {
  this.thread = new loop.audio.SampleProcessThread(this.result.bind(this));

  lib.msg.listen(loop.audio.msg.SCROLL_TO_BEGINNING, this.scrollToBeginning.bind(this));

  loop.audio.core.getUserMedia(
      {video: false, audio: true},
      this.success.bind(this),
      this.error.bind(this));
};

loop.audio.Looper.prototype.result = function(index, left, right) {
  this.samples[index].update(index, left, right);
};

loop.audio.Looper.prototype.success = function(stream) {
  var mediaSource = loop.audio.core.context.createMediaStreamSource(stream);
  mediaSource.connect(this.gain);
  this.gain.connect(this.recorder);
  this.gain.connect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.error = function(e) {
  lib.functions.error('Error on getUserMedia()', e);
};

loop.audio.Looper.prototype.download = function(opt_selection) {
  if (!this.samples.length) {
    return;
  }

  var sampleInit = this.useSelection && opt_selection ? this.selectionMin : 0;
  var sampleEnd = this.useSelection && opt_selection ? this.selectionMax : this.samples.length;
  this.encoder.encode(this.samples, sampleInit, sampleEnd);
  this.encoder.asDataUrl(this.downloadReady.bind(this));
};

loop.audio.Looper.prototype.downloadReady = function(dataUrl) {
  var downloadLink = document.createElement('a');
  downloadLink.href = dataUrl;
  downloadLink.download = 'loop.aiff';

  var e = document.createEvent('MouseEvents');
  e.initEvent('click', true, true);
  downloadLink.dispatchEvent(e);
};

loop.audio.Looper.prototype.onAudioRecord = function(e) {
  if (!this.isRecording) {
    return;
  }
  var index = this.samples.length;
  // Fast-copy the buffer, as ScriptProcessor reuses its internal buffers on each event.
  var data = new Float32Array(e.inputBuffer.getChannelData(0));
  var sample = new loop.audio.Sample(index, data);

  this.samples.push(sample);
  this.thread.start({index: index, sample: data});

  if (index > this.rect.width) {
    this.viewportEnabled = true;
    this.viewportX++;
  }
};

loop.audio.Looper.prototype.onAudioPlayback = function(e) {
  var size = this.samples.length;
  if (!this.isPlaying || !size || this.playerPosition >= size) {
    return;
  }
  var data = e.outputBuffer.getChannelData(e);
  data.set(this.samples[this.playerPosition].sample);
  if (this.useSelection) {
    this.playerPosition++;;
    if (this.playerPosition > this.selectionMax) {
      this.playerPosition = this.selectionMin;
    }
  } else {
    this.playerPosition = (this.playerPosition + 1) % size;
  }
  if (this.playerPosition > this.viewportX + this.rect.width) {
    this.viewportEnabled = true;
    this.viewportX++;
  }
};

loop.audio.Looper.prototype.startRecording = function() {
  if (this.isRecording) {
    return;
  }
  if (this.isPlaying) {
    this.stopPlaying();
  }
  this.deselect();
  this.samples = [];
  this.viewportEnabled = false;
  this.viewportX = 0;
  this.isRecording = true;
  this.recorder.connect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.stopRecording = function() {
  this.isRecording = false;
  this.recorder.disconnect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.startPlaying = function() {
  this.stopRecording();
  this.isPlaying = true;
  this.playerPosition = this.selectionMin;
  this.player.connect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.stopPlaying = function() {
  this.isPlaying = false;
  this.player.disconnect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.stopAnything = function() {
  if (this.isPlaying) {
    this.stopPlaying();
  } else if (this.isRecording) {
    this.stopRecording();
  }
};

loop.audio.Looper.prototype.scrollToBeginning = function() {
  if (this.isRecording || !this.viewportEnabled) {
    return;
  }
  this.viewportX = 0;
};

loop.audio.Looper.prototype.scrollToEnd = function() {
  if (this.isRecording || !this.viewportEnabled) {
    return;
  }
  this.viewportX = Math.max(0, this.samples.length - this.rect.width);
};

loop.audio.Looper.prototype.toggleCurrentState = function() {
  if (this.isRecording) {
    this.stopRecording();
  } else if (this.isPlaying) {
    this.stopPlaying();
  } else {
    this.startPlaying();
  }
};

loop.audio.Looper.prototype.deselect = function() {
  this.selectionMin = 0;
  this.selectionMax = 0;
  this.useSelection = false;
};

loop.audio.Looper.prototype.selecting = function(min, max) {
  this.selectionMin = this.viewportTranslateX(Math.min(min, this.samples.length));
  this.selectionMax = this.viewportTranslateX(Math.min(max, this.samples.length));
};

loop.audio.Looper.prototype.subselect = function(x) {
  var tx = this.viewportTranslateX(x);
  if (tx < this.selectionMin) {
    this.selectionMin = tx;
  } else if (x > this.selectionMax) {
    this.selectionMax = tx;
  } else {
    var dxMin = tx - this.selectionMin;
    var dxMax = this.selectionMax - tx;
    if (dxMin < dxMax) {
      this.selectionMin = tx;
    } else {
      this.selectionMax = tx;
    }
  }
};

loop.audio.Looper.prototype.select = function() {
  if (this.useSelection) {
    if (this.isPlaying) {
      this.stopPlaying();
      this.startPlaying();
    }
  }
  this.useSelection = true;
};

loop.audio.Looper.prototype.render = function() {
  var middle = this.rect.height * 0.5;

  // Background
  lib.ui.ctx.fillStyle = lib.ui.style.defs.itemBackground.color;
  lib.ui.ctx.fillRect(0, 0, this.rect.width, this.rect.height);

  lib.ui.ctx.lineWidth = 1.0;
  lib.ui.ctx.strokeStyle = lib.ui.style.defs.itemStandby.color;
  lib.ui.ctx.strokeRect(0, middle, this.rect.width, middle);

  // Samples
  var viewportSampleIndex = this.viewportTranslateX(0);
  for (var i = 0, sample, count = Math.min(this.samples.length, this.rect.width);
       (sample = this.samples[i + viewportSampleIndex]) && i < count;
       ++i) {
    var left = sample.leftAverage;
    var right = sample.rightAverage;

    var viewportI = this.viewportTranslateX(i);

    if (this.isPlaying && viewportI == this.playerPosition) {
      lib.ui.ctx.strokeStyle = lib.ui.style.defs.looperMarkerStandby.color;
      lib.ui.ctx.beginPath();
      lib.ui.ctx.moveTo(i, 0);
      lib.ui.ctx.lineTo(i, this.rect.height);
      lib.ui.ctx.closePath();
      lib.ui.ctx.stroke();
      // Playing
      lib.ui.ctx.strokeStyle = lib.ui.style.defs.looperMarkerHighlight.color;
    } else if (this.selectionMin != this.selectionMax &&
        viewportI >= this.selectionMin && viewportI <= this.selectionMax) {
      // Selection
      lib.ui.ctx.strokeStyle = lib.ui.style.defs.itemHighlight.color;
    } else {
      // Recording
      lib.ui.ctx.strokeStyle = lib.ui.style.defs.itemStandby.color;
    }

    lib.ui.ctx.beginPath();
    lib.ui.ctx.moveTo(i, middle - (Math.abs(left * 20) * middle));
    lib.ui.ctx.lineTo(i, middle + (Math.abs(right * 20) * middle));
    lib.ui.ctx.closePath();
    lib.ui.ctx.stroke();
  }

  lib.ui.ctx.strokeStyle = lib.ui.style.defs.itemStandby.color;
  lib.ui.ctx.strokeRect(0, 0, this.rect.width, this.rect.height);
};

loop.audio.Looper.prototype.handleMouseDown = function(e, tx, ty) {
  if (e.shiftKey) {
    return false;
  }
  this.handlingSelection = true;
  this.handlingInit = tx;
  this.handlingEnd = tx;

  return true;
};

loop.audio.Looper.prototype.handleMouseMove = function(e, tx, ty) {
  if (!this.handlingSelection) {
    return false;
  }
  this.handlingEnd = tx;

  var min = Math.min(this.handlingInit, this.handlingEnd);
  var max = Math.max(this.handlingInit, this.handlingEnd);
  this.selecting(min, max);

  return true;
};

loop.audio.Looper.prototype.handleMouseUp = function(e, tx, ty) {
  if (!this.handlingSelection) {
    return false;
  }
  this.handlingSelection = false;
  if (this.handlingInit == this.handlingEnd) {
    this.deselect();
  } else {
    this.select();
  }
  return true;
};

loop.audio.Looper.prototype.handleWheel = function(e, tx, ty, wheelX, wheelY) {
  if (wheelX < 0 && this.samples.length - this.viewportX < this.rect.width) {
    return false;
  }
  return lib.ui.Viewport.prototype.handleWheel.call(this, e, tx, ty, wheelX, wheelY);
};

loop.audio.Looper.prototype.handleClick = function(e, tx, ty) {
  if (e.shiftKey) {
    this.subselect(tx);
    return true;
  }
  return false;
};

loop.audio.Looper.prototype.handleKeyDown = function(e) {
  switch (e.keyCode) {
    case 82: // R
      this.startRecording();
      break;
    case 32: // Space
      this.toggleCurrentState();
      break;
    case 27: // Esc
      this.stopAnything();
      break;
    case 36: // Home
      lib.msg.send(loop.audio.msg.SCROLL_TO_BEGINNING);
      break;
    case 35: // End
      this.scrollToEnd();
      break;
    default:
      return false;
      break;
  }
  return true;
};


namespace('loop.audio.core');
loop.audio.core.context = new (window.AudioContext || window.webkitAudioContext)();

loop.audio.core.getUserMedia = (
    navigator.getUserMedia || navigator.webkitGetUserMedia).bind(navigator);


namespace('loop.main');
loop.main = function() {
  lib.ui.maestro = new lib.ui.Maestro();
  lib.ui.maestro.root = new loop.audio.Looper();
  lib.ui.maestro.root.addComponent(lib.ui.Button.create('begin', '<<', function() {
    lib.msg.send(loop.audio.msg.SCROLL_TO_BEGINNING);
  }));

  lib.ui.init();

  // Global events.
  window.addEventListener('resize', lib.ui.resize);
  lib.ui.maestro.addEventListeners();
};

// Start the show.
window.addEventListener('load', loop.main);
