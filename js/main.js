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
  this.worker_ = null;
};

loop.comm.Worker.prototype.thread = lib.functions.EMPTY;
loop.comm.Worker.prototype.process = lib.functions.EMPTY;

loop.comm.Worker.prototype.threadImpl_ = function() {
  var retFn = 'var __fn = ' + this.thread.toString() + ';\n';
  var msgFn = 'function(e) { var ret = __fn(e.data); postMessage(ret); };\n';
  var code = retFn + 'onmessage = ' + msgFn;
  return code;
};

loop.comm.Worker.prototype.processImpl_ = function(e) {
  this.process(e.data);
};

loop.comm.Worker.prototype.init_ = function() {
  var blob = new Blob([this.threadImpl_()]);
  var blobUrl = URL.createObjectURL(blob);

  this.worker_ = new Worker(blobUrl);
  this.worker_.onmessage = this.processImpl_.bind(this);
};

loop.comm.Worker.prototype.send = function(data) {
  if (!this.worker_) {
    this.init_();
  }
  this.worker_.postMessage(data);
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

loop.audio.StereoReduceWorker.prototype.process = function(data) {
  console.log(data);
};

loop.audio.StereoReduceWorker.prototype.reduce = function(stereoArray) {
  this.send(stereoArray);
};
