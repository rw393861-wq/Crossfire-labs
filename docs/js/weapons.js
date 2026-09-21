const WEAPONS = {
  main: [
    { id: 'rifle', name: 'Rifle', dmg: 12, cd: 0.12, spread: 0.05, mag: 30, reload: 2.2, range: 900, pellets: 1, barrel: 20 },
    { id: 'shotgun', name: 'Shotgun', dmg: 9, cd: 0.9, spread: 0.2, mag: 6, reload: 2.8, range: 380, pellets: 8, falloff: 0.6, barrel: 17 },
    { id: 'sniper', name: 'Sniper', dmg: 68, cd: 1.5, spread: 0.006, mag: 5, reload: 3.0, range: 1500, pellets: 1, slow: 0.8, barrel: 26 }
  ],
  alt: [
    { id: 'pistol', name: 'Pistol', dmg: 15, cd: 0.3, spread: 0.035, mag: 12, reload: 1.4, range: 700, pellets: 1, barrel: 13 },
    { id: 'smg', name: 'SMG', dmg: 7, cd: 0.075, spread: 0.1, mag: 25, reload: 1.8, range: 550, pellets: 1, barrel: 15 },
    { id: 'revolver', name: 'Revolver', dmg: 36, cd: 0.75, spread: 0.02, mag: 6, reload: 2.6, range: 800, pellets: 1, barrel: 14 }
  ],
  util: [
    {
      id: 'grenade', name: 'Grenade', count: 2, cd: 1.2, fuse: 1.8, fuseJitter: 0.25,
      minSpeed: 240, maxSpeed: 620, blast: 105, blastDmg: 50,
      fragMin: 14, fragMax: 24, fragDmg: [4, 13], fragRange: [120, 330]
    },
    { id: 'medkit', name: 'Medkit', count: 2, cd: 0.5, time: 1.5, rate: 30 },
    {
      id: 'molotov', name: 'Molotov', count: 2, cd: 1.2, fuse: 1.0, fuseJitter: 0,
      minSpeed: 240, maxSpeed: 560, radius: [55, 80], burn: [5.5, 7.5], dps: 22
    }
  ]
};

const SLOT_NAMES = { main: 'Main', alt: 'Alt', util: 'Utility' };
