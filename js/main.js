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


namespace('loop.comm.Worker');
loop.comm.Worker = function() {
  this.worker = null;
};

loop.comm.Worker.prototype.thread = lib.functions.EMPTY;
loop.comm.Worker.prototype.process = lib.functions.EMPTY;

loop.comm.Worker.prototype.threadImpl = function() {
  var retFn = 'var __fn = ' + this.thread.toString() + ';\n';
  var msgFn = 'function(e) { var ret = __fn(e.data); postMessage(ret); };\n';
  var code = retFn + 'onmessage = ' + msgFn;
  return code;
};

loop.comm.Worker.prototype.processImpl = function(e) {
  this.process(e.data);
};

loop.comm.Worker.prototype.init = function() {
  var blob = new Blob([this.threadImpl()]);
  var blobUrl = URL.createObjectURL(blob);

  this.worker = new Worker(blobUrl);
  this.worker.onmessage = this.processImpl.bind(this);
};

loop.comm.Worker.prototype.send = function(data) {
  if (!this.worker) {
    this.init();
  }
  this.worker.postMessage(data);
};


namespace('loop.audio.StereoReduceWorker');
loop.audio.StereoReduceWorker = function() {
  loop.comm.Worker.call(this);
};
lib.inherits(loop.audio.StereoReduceWorker, loop.comm.Worker);

loop.audio.StereoReduceWorker.prototype.thread = function(data) {
  var leftAverage = 0;
  var rightAverage = 0;
  for (var i = 0, count = 1; i < data.length; i += 2, ++count) {
    leftAverage += (data[i] - leftAverage) / count;
    rightAverage += (data[i + 1] - rightAverage) / count;
  }
  return {
    left: leftAverage,
    right: rightAverage
  };
};


namespace('loop.audio.Sample');
loop.audio.Sample = function(sample) {
  this.sample = sample;
  this.averages = null;
};
lib.inherits(loop.audio.Sample, loop.audio.StereoReduceWorker);

loop.audio.Sample.prototype.update = function() {
  this.send(this.sample);
};

loop.audio.Sample.prototype.process = function(data) {
  this.averages = data;
  this.render();
};

loop.audio.Sample.prototype.render = function() {
  console.log(this.averages);
};


namespace('loop.audio.Looper');
loop.audio.Looper = function() {
  this.samples = [];
  this.isRecording = false;

  this.gain = loop.audio.core.context.createGain();
  this.gain.gain.value = 2.0;

  this.script = loop.audio.core.context.createScriptProcessor(1024);
  this.script.onaudioprocess = this.process.bind(this);
};

loop.audio.Looper.prototype.init = function() {
  loop.audio.core.getUserMedia(
      {video: false, audio: true},
      this.success.bind(this),
      this.error.bind(this));
};

loop.audio.Looper.prototype.success = function(stream) {
  var mediaSource = loop.audio.core.context.createMediaStreamSource(stream);
  mediaSource.connect(this.gain);
  this.gain.connect(this.script);
  this.gain.connect(loop.audio.core.context.destination);
};

loop.audio.Looper.prototype.error = function() {
  console.log('error');
};

loop.audio.Looper.prototype.process = function(e) {
  if (!this.isRecording) {
    return;
  }
  var data = e.inputBuffer.getChannelData(0);
  var sample = new loop.audio.Sample(data);
  sample.update();
  this.samples.push(sample);
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

loop.ui.init = function() {
  loop.ui.canvas = document.querySelector('canvas');
  loop.ui.paint = loop.ui.canvas.getContext('2d');
  loop.ui.resize();
};

loop.ui.render = function() {
};

loop.ui.resize = function() {
  loop.ui.canvas.width = document.width;
  loop.ui.canvas.height = document.height;
  loop.ui.render();
};

window.addEventListener('load', loop.ui.init);
window.addEventListener('resize', loop.ui.resize);
