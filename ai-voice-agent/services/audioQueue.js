// services/audioQueue.js

class AudioJobQueue {
  constructor() {
    this.jobs = [];
    this.running = false;
  }

  push(job) {
    this.jobs.push(job);
  }

  shift() {
    return this.jobs.shift() || null;
  }

  size() {
    return this.jobs.length;
  }
}

module.exports = {
  AudioJobQueue,
};
