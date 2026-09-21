const REWARD = {
  outcome: {
    dmg: 1,
    kill: 40,
    assist: 15,
    taken: -0.5,
    death: -20,
    self: -1,
    healed: 0.5,
    healWaste: -5
  },
  shaping: {
    spot: 3,
    view: 0.5,
    aimGain: 6,
    onTarget: 3,
    goodShot: 0.3,
    looseShot: -0.1,
    blindShot: -0.3,
    hit: 1,
    accuracy: 15,
    exposed: -1,
    explore: 1,
    stuck: -1,
    wastedUtil: -3
  },
  coachStart: 1,
  coachEnd: 0.35,
  coachUpdates: 300,
  exploreCap: 30,
  assistWindow: 4,
  labels: {
    dmg: 'Damage dealt', kill: 'Kills', assist: 'Assists', taken: 'Damage taken', death: 'Deaths',
    self: 'Self damage', healed: 'Healing used', healWaste: 'Wasted medkits',
    spot: 'Spotting', view: 'Enemy in view', aimGain: 'Turning onto target', onTarget: 'Crosshair on enemy',
    goodShot: 'Shots on target', looseShot: 'Shots off target', blindShot: 'Blind fire', hit: 'Hits',
    accuracy: 'Accuracy bonus', exposed: 'In enemy crosshair', explore: 'Exploring', stuck: 'Stuck on walls',
    wastedUtil: 'Wasted throws'
  },

  keys() { return Object.keys(this.outcome).concat(Object.keys(this.shaping)); },

  coach(updates) {
    const k = Math.min(1, updates / this.coachUpdates);
    return this.coachStart + (this.coachEnd - this.coachStart) * k;
  },

  blank() {
    const o = {};
    for (const k of this.keys()) o[k] = 0;
    return o;
  },

  score(raw, coach, into) {
    let r = 0;
    for (const k in this.outcome) {
      const p = this.outcome[k] * raw[k];
      r += p;
      if (into) into[k] += p;
    }
    for (const k in this.shaping) {
      const p = this.shaping[k] * raw[k] * coach;
      r += p;
      if (into) into[k] += p;
    }
    return r;
  }
};
