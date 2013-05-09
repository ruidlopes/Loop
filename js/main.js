// Loop - main.js
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
lib.functions.constant = function(value) {
  return function() {
    return value;
  };
};
lib.functions.EMPTY = lib.functions.constant(undefined);
lib.functions.TRUE = lib.functions.constant(true);
lib.functions.FALSE = lib.functions.constant(false);


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
       i+= 2, count++, invCount = 1 / count) {
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


namespace('loop.audio.Looper');
loop.audio.Looper = function() {
  this.thread = null;
  this.samples = [];

  this.gain = loop.audio.core.context.createGain();
  this.gain.gain.value = 10.0;

  this.recorder = loop.audio.core.context.createScriptProcessor(1024, 1, 1);
  this.recorder.onaudioprocess = this.onAudioRecord.bind(this);
  this.isRecording = false;

  this.player = loop.audio.core.context.createScriptProcessor(1024, 0, 1);
  this.player.onaudioprocess = this.onAudioPlayback.bind(this);
  this.isPlaying = false;
  this.playerPosition = 0;

  this.selectionMin = 0;
  this.selectionMax = 0;
};

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
};

loop.audio.Looper.prototype.onAudioPlayback = function(e) {
  var size = this.samples.length;
  if (!this.isPlaying || !size) {
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
};

loop.audio.Looper.prototype.startRecording = function() {
  if (this.isRecording) {
    return;
  }
  if (this.isPlaying) {
    this.stopPlaying();
  }
  this.samples = [];
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
  this.selectionMin = Math.min(min, this.samples.length);
  this.selectionMax = Math.min(max, this.samples.length);
};

loop.audio.Looper.prototype.subselect = function(x) {
  if (x < this.selectionMin) {
    this.selectionMin = x;
  } else if (x > this.selectionMax) {
    this.selectionMax = x;
  } else {
    var dxMin = x - this.selectionMin;
    var dxMax = this.selectionMax - x;
    if (dxMin < dxMax) {
      this.selectionMin = x;
    } else {
      this.selectionMax = x;
    }
  }
};

loop.audio.Looper.prototype.select = function() {
  this.useSelection = true;
};

loop.audio.Looper.prototype.render = function() {
  for (var i = 0; i < this.samples.length; ++i) {
    var left = this.samples[i].leftAverage;
    var right = this.samples[i].rightAverage;
    var middle = loop.ui.height * 0.5;

    loop.ui.paint.beginPath();
    loop.ui.paint.moveTo(i, middle - (Math.abs(left * 20) * middle));
    loop.ui.paint.lineTo(i, middle + (Math.abs(right * 20) * middle));
    loop.ui.paint.closePath();

    loop.ui.paint.lineWidth = 1.0;
    if (this.isPlaying && i >= this.selectionMin && i <= this.playerPosition) {
      loop.ui.paint.strokeStyle = '#c33';
    } else if (this.selectionMin != this.selectionMax &&
               i >= this.selectionMin && i <= this.selectionMax) {
      loop.ui.paint.strokeStyle = '#3c3';
    } else {
      loop.ui.paint.strokeStyle = '#fff';
    }
    loop.ui.paint.stroke();
  }
};


namespace('loop.audio.core');

loop.audio.core.context = (function() {
  return new (window.AudioContext || window.webkitAudioContext)();
})();

loop.audio.core.getUserMedia = (
    navigator.getUserMedia || navigator.webkitGetUserMedia).bind(navigator);

loop.audio.core.looper = new loop.audio.Looper();


namespace('loop.events');

loop.events.handling = false;
loop.events.initX = -1;
loop.events.endX = -1;

loop.events.onMouseDown = function(e) {
  loop.events.handling = true;
  loop.events.initX = e.clientX;
};

loop.events.onMouseMove = function(e) {
  if (!loop.events.handling) {
    return;
  }
  loop.events.endX = e.clientX;

  var min = Math.min(loop.events.initX, loop.events.endX);
  var max = Math.max(loop.events.initX, loop.events.endX);
  loop.audio.core.looper.selecting(min, max);
};

loop.events.onMouseUp = function(e) {
  loop.events.handling = false;
  if (loop.events.initX == loop.events.endX) {
    loop.audio.core.looper.deselect();
  } else {
    loop.audio.core.looper.select();
  }
  loop.events.initX = -1;
  loop.events.endX = -1;
};

loop.events.onClick = function(e) {
  if (e.shiftKey) {
    loop.audio.core.looper.subselect(e.clientX);
  }
};

loop.events.onKeyDown = function(e) {
  switch (e.keyCode) {
    case 82:  // R
      loop.audio.core.looper.startRecording();
      break;
    case 32:  // Space
      loop.audio.core.looper.toggleCurrentState();
      break;
    default:
      break;
  }
};


namespace('loop.ui');

loop.ui.canvas = null;
loop.ui.paint = null;
loop.ui.width = 0;
loop.ui.height = 0;

loop.ui.requestAnimationFrame = (
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame).bind(window);

loop.ui.init = function() {
  loop.ui.canvas = document.querySelector('canvas');
  loop.ui.paint = loop.ui.canvas.getContext('2d');
  loop.ui.resize();

  (function __loop() {
    loop.ui.requestAnimationFrame(__loop);
    loop.ui.render();
  })();
};

loop.ui.clear = function() {
  loop.ui.paint.save();
  loop.ui.paint.setTransform(1, 0, 0, 1, 0, 0);
  loop.ui.paint.clearRect(0, 0, loop.ui.width, loop.ui.height);
  loop.ui.paint.restore();
}

loop.ui.render = function() {
  loop.ui.clear();
  loop.audio.core.looper.render();
};

loop.ui.resize = function() {
  loop.ui.width = loop.ui.canvas.width = document.width;
  loop.ui.height = loop.ui.canvas.height = document.height;
};


namespace('loop.main');
loop.main = function() {
  loop.audio.core.looper.init();
  loop.ui.init();
};


// Global events.
window.addEventListener('load', loop.main);
window.addEventListener('resize', loop.ui.resize);

window.addEventListener('mousedown', loop.events.onMouseDown);
window.addEventListener('mousemove', loop.events.onMouseMove);
window.addEventListener('mouseup', loop.events.onMouseUp);
window.addEventListener('click', loop.events.onClick);
window.addEventListener('keydown', loop.events.onKeyDown);
