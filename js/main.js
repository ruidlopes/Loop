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
lib.functions.error = function(value) {
  return function() {
    throw Error(value);
  };
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
lib.assert.exists = function(thing) {
  if (!thing) {
    lib.functions.error('Value does not exist.');
  };
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

  lib.ui.resize();

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


namespace('lib.ui.Component');
lib.ui.Component = function(id) {
  this.id = id;
  this.element = null;
  this.rect = null;

  this.create();
};

lib.ui.Component.prototype.create = function() {
  this.element = document.createElement('div');
  this.element.id = this.id;
  this.element.classList.add('component');
  document.body.appendChild(this.element);
};

lib.ui.Component.prototype.computeRect = function() {
  this.rect = this.element.getBoundingClientRect();
};

lib.ui.Component.prototype.isCoordinateWithin = function(x, y) {
  return x >= this.rect.left &&
    x <= this.rect.right &&
    y >= this.rect.top &&
    y <= this.rect.bottom;
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
lib.ui.Viewport = function(id) {
  lib.ui.Component.call(this, id);

  this.viewportX = 0;
  this.viewportY = 0;
  this.viewportEnabled = false;
};
lib.inherits(lib.ui.Viewport, lib.ui.Component);

lib.ui.Viewport.prototype.handleWheel = function(e, tx, ty, wheelX, wheelY) {
  if (!this.viewportEnabled) {
    return;
  }
  this.viewportX = Math.max(0, this.viewportX - wheelX);
  this.viewportY = Math.max(0, this.viewportY - wheelY);
};

lib.ui.Viewport.prototype.viewportTranslateX = function(x) {
  return this.viewportEnabled ? this.viewportX + x : x;
};

lib.ui.Viewport.prototype.viewportTranslateY = function(y) {
  return this.viewportEnabled ? this.viewportY + y : y;
};


namespace('lib.ui.Maestro');
lib.ui.Maestro = function() {
  this.components = [];
};

lib.ui.Maestro.prototype.addComponent = function(component) {
  this.components.push(component);
  component.init();
};

lib.ui.Maestro.prototype.clear = function() {
  lib.ui.ctx.save();
  lib.ui.ctx.setTransform(1, 0, 0, 1, 0, 0);
  lib.ui.ctx.clearRect(0, 0, lib.ui.width, lib.ui.height);
  lib.ui.ctx.restore();
};

lib.ui.Maestro.prototype.resize = function() {
  for (var i = 0, component; component = this.components[i++];) {
    component.computeRect();
  }
};

lib.ui.Maestro.prototype.render = function() {
  this.clear();

  for (var i = 0, component; component = this.components[i++];) {
    lib.ui.ctx.beginPath();
    lib.ui.ctx.rect(
        component.rect.left, component.rect.top, component.rect.width, component.rect.height);
    lib.ui.ctx.clip();

    lib.ui.ctx.save();
    lib.ui.ctx.translate(component.rect.left + 0.5, component.rect.top + 0.5);
    component.render();
    lib.ui.ctx.restore();
  }
};

lib.ui.Maestro.prototype.addEventListener = function(eventType, handler) {
  window.addEventListener(eventType, handler.bind(this));
};

lib.ui.Maestro.prototype.addEventListeners = function() {
  this.addEventListener('mousedown', this.handleMouseDown);
  this.addEventListener('mousemove', this.handleMouseMove);
  this.addEventListener('mouseup', this.handleMouseUp);
  this.addEventListener('click', this.handleClick);

  this.addEventListener('mousewheel', this.handleWheel);
  this.addEventListener('wheel', this.handleWheel);

  this.addEventListener('keydown', this.handleKeyDown);
};

lib.ui.Maestro.prototype.tX = function(component, x) {
  return x - component.rect.left;
};

lib.ui.Maestro.prototype.tY = function(component, y) {
  return y - component.rect.top;
};

lib.ui.Maestro.prototype.willHandleMouse = function(e, component, handler, param1, param2) {
  return component.isCoordinateWithin(e.clientX, e.clientY) &&
    handler.call(component, e,
        this.tX(component, e.clientX), this.tY(component, e.clientY),
        param1, param2);
};

lib.ui.Maestro.prototype.handleMouseDown = function(e) {
  for (var i = 0, component; component = this.components[i++];) {
    if (this.willHandleMouse(e, component, component.handleMouseDown)) {
      return;
    }
  }
};

lib.ui.Maestro.prototype.handleMouseMove = function(e) {
  for (var i = 0, component; component = this.components[i++];) {
    if (this.willHandleMouse(e, component, component.handleMouseMove)) {
      return;
    }
  }
};

lib.ui.Maestro.prototype.handleMouseUp = function(e) {
  for (var i = 0, component; component = this.components[i++];) {
    if (this.willHandleMouse(e, component, component.handleMouseUp)) {
      return;
    }
  }
};

lib.ui.Maestro.prototype.handleClick = function(e) {
  for (var i = 0, component; component = this.components[i++];) {
    if (this.willHandleMouse(e, component, component.handleClick)) {
      return;
    }
  }
};

lib.ui.Maestro.prototype.handleWheel = function(e) {
  var deltaX = e.deltaX || e.wheelDeltaX;
  var deltaY = e.deltaY || e.wheelDeltaY;
  for (var i = 0, component; component = this.components[i++];) {
    if (this.willHandleMouse(e, component, component.handleWheel, deltaX, deltaY)) {
      return;
    }
  }
  e.preventDefault();
};

lib.ui.Maestro.prototype.handleKeyDown = function(e) {
  for (var i = 0, component; component = this.components[i++];) {
    if (component.handleKeyDown(e)) {
      return;
    }
  }
};


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

  for (var i = 0, count = 1, invCount = 1, len = sample.length;
       i < len;
       i += 2, count++, invCount = 1 / count) {
    leftAverage += (sample[i] - leftAverage) * invCount;
    rightAverage += (sample[i + 1] - rightAverage) * invCount;
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
  lib.assert.exists(this.blob);

  // TODO: revoke the object URL asynchronously.
  callback(URL.createObjectURL(this.blob));
};

loop.audio.Encoder.prototype.asBinaryString = function(callback) {
  lib.assert.exists(this.blob);

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

  for (var i = 0; i < end; ++i) {
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

loop.audio.Looper.prototype.error = function() {
  console.log('error');
};

loop.audio.Looper.prototype.download = function(opt_selection) {
  if (!this.samples.length) {
    return;
  }

  var sampleInit = this.useSelection && opt_selection ? this.selectionMin : 0;
  var sampleEnd = this.useSelection && opt_selection ? this.selectionMax : this.samples.length;
  this.encoder.encode(this.samples, sampleInit, sampleEnd);
  this.encoder.asDataUrl(this.downloadReady);
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
  lib.ui.ctx.fillStyle = '#9cf';
  lib.ui.ctx.fillRect(0, 0, this.rect.width, this.rect.height);

  lib.ui.ctx.lineWidth = 1.0;
  lib.ui.ctx.strokeStyle = '#69c';
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
      lib.ui.ctx.strokeStyle = '#c88';
      lib.ui.ctx.beginPath();
      lib.ui.ctx.moveTo(i, 0);
      lib.ui.ctx.lineTo(i, this.rect.height);
      lib.ui.ctx.closePath();
      lib.ui.ctx.stroke();
      // Playing
      lib.ui.ctx.strokeStyle = '#c00';
    } else if (this.selectionMin != this.selectionMax &&
        viewportI >= this.selectionMin && viewportI <= this.selectionMax) {
      // Selection
      lib.ui.ctx.strokeStyle = '#369';
    } else {
      // Recording
      lib.ui.ctx.strokeStyle = '#69c';
    }

    lib.ui.ctx.beginPath();
    lib.ui.ctx.moveTo(i, middle - (Math.abs(left * 20) * middle));
    lib.ui.ctx.lineTo(i, middle + (Math.abs(left * 20) * middle));
    lib.ui.ctx.closePath();
    lib.ui.ctx.stroke();
  }

  lib.ui.ctx.strokeStyle = '#69c';
  lib.ui.ctx.strokeRect(0, 0, this.rect.width, this.rect.height);
};

loop.audio.Looper.prototype.handleMouseDown = function(e, tx, ty) {
  if (e.shiftKey) {
    return;
  }
  this.handlingSelection = true;
  this.handlingInit = tx;
  this.handlingEnd = tx;
};

loop.audio.Looper.prototype.handleMouseMove = function(e, tx, ty) {
  if (!this.handlingSelection) {
    return;
  }
  this.handlingEnd = tx;

  var min = Math.min(this.handlingInit, this.handlingEnd);
  var max = Math.max(this.handlingInit, this.handlingEnd);
  this.selecting(min, max);
};

loop.audio.Looper.prototype.handleMouseUp = function(e, tx, ty) {
  this.handlingSelection = false;
  if (this.handlingInit == this.handlingEnd) {
    this.deselect();
  } else {
    this.select();
  }
};

loop.audio.Looper.prototype.handleWheel = function(e, tx, ty, wheelX, wheelY) {
  if (wheelX < 0 && this.samples.length - this.viewportX < this.rect.width) {
    return;
  }
  lib.ui.Viewport.prototype.handleWheel.call(this, e, tx, ty, wheelX, wheelY);
};

loop.audio.Looper.prototype.handleClick = function(e, tx, ty) {
  if (e.shiftKey) {
    this.subselect(tx);
  }
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
      this.scrollToBeginning();
      break;
    case 35: // End
      this.scrollToEnd();
      break;
    default:
      break;
  }
};


namespace('loop.audio.core');
loop.audio.core.context = new (window.AudioContext || window.webkitAudioContext)();

loop.audio.core.getUserMedia = (
    navigator.getUserMedia || navigator.webkitGetUserMedia).bind(navigator);


namespace('loop.main');
loop.main = function() {
  lib.ui.maestro = new lib.ui.Maestro();
  lib.ui.maestro.addComponent(new loop.audio.Looper());
  lib.ui.init();

  // Global events.
  window.addEventListener('resize', lib.ui.resize);
  lib.ui.maestro.addEventListeners();
};

// Start the show.
window.addEventListener('load', loop.main);
