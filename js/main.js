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
  this.isRecording = false;

  this.gain = loop.audio.core.context.createGain();
  this.gain.gain.value = 10.0;

  this.script = loop.audio.core.context.createScriptProcessor(1024, 1, 1);
  this.script.onaudioprocess = this.onAudioProcess.bind(this);
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
  this.gain.connect(this.script);
  this.script.connect(loop.audio.core.context.destination);
  this.gain.connect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.error = function() {
  console.log('error');
};

loop.audio.Looper.prototype.onAudioProcess = function(e) {
  if (!this.isRecording) {
    return;
  }
  var index = this.samples.length;
  var data = e.inputBuffer.getChannelData(0);
  var sample = new loop.audio.Sample(index, data);

  this.samples.push(sample);
  this.thread.start({index: index, sample: data});
};

loop.audio.Looper.prototype.record = function() {
  if (this.isRecording) {
    return;
  }
  this.samples = [];
  this.isRecording = true;
};

loop.audio.Looper.prototype.play = function() {
  this.isRecording = false;
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
    loop.ui.paint.strokeStyle = '#fff';
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

loop.ui.render = function() {
  loop.audio.core.looper.render();
};

loop.ui.resize = function() {
  loop.ui.width = loop.ui.canvas.width = document.width;
  loop.ui.height = loop.ui.canvas.height = document.height;
};

window.addEventListener('load', loop.ui.init);
window.addEventListener('resize', loop.ui.resize);
