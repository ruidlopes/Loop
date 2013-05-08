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


namespace('loop.audio.Sample');
loop.audio.Sample = function(sample) {
  this.sample = sample;
  this.averages = null;
};

loop.audio.Sample.prototype.calcAverages = function() {
  var leftAverage = 0;
  var rightAverage = 0;
  for (var i = 0, count = 1; i < this.sample.length; i += 2, ++count) {
    leftAverage += (this.sample[i] - leftAverage) / count;
    rightAverage += (this.sample[i + 1] - rightAverage) / count;
  }
  this.averages = {
    left: leftAverage,
    right: rightAverage
  };
};

loop.audio.Sample.prototype.update = function() {
  this.calcAverages();
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
  this.gain.gain.value = 10.0;

  this.script = loop.audio.core.context.createScriptProcessor(1024, 1, 1);
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
  this.script.connect(loop.audio.core.context.destination);
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
  var sample = new loop.audio.Sample(data.subarray(0));
  data = null;
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
