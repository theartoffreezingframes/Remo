/* ============================================================================
   90 — CAMPAIGN, MISSION SCRIPTS & DIALOGUE
   The full 15-mission structure lives here as data; Act I (Missions 1 & 2) is
   fully playable, the rest are authored beats the engine will drive later.
   ============================================================================ */

const CAMPAIGN = [
  { act: 'I', actName: 'THE PERFECT EMPLOYEE', n: 1, title: 'Monday Morning', status: 'playable',
    blurb: 'Office routine, a walk through the Financial District, and a first conversation that changes everything.' },
  { act: 'I', actName: 'THE PERFECT EMPLOYEE', n: 2, title: 'The Missing Amount', status: 'playable',
    blurb: 'A ₹4.2 crore discrepancy. A keycard. A server room that should not exist.' },
  { act: 'I', actName: 'THE PERFECT EMPLOYEE', n: 3, title: 'Account Suspended', status: 'authored',
    blurb: 'Framed. Badges revoked. Two security teams and a city to cross.' },
  { act: 'II', actName: 'THE BIRTH OF "R"', n: 4, title: 'A New Face', status: 'authored',
    blurb: 'Build the persona. Clothes, cadence, alibi. Disguise mechanics come online.' },
  { act: 'II', actName: 'THE BIRTH OF "R"', n: 5, title: 'The Wrong Invitation', status: 'authored',
    blurb: 'The Vantara Gala. Keerthy is working it. You were not invited.' },
  { act: 'II', actName: 'THE BIRTH OF "R"', n: 6, title: 'Two Dates, One Disaster', status: 'authored',
    blurb: 'Two identities, one evening, and Naveen on comms making it worse.' },
  { act: 'III', actName: 'THE MONEY TRAIL', n: 7, title: 'Follow the Pattern', status: 'authored',
    blurb: 'Ghost funds across four districts. Pattern Sight at city scale.' },
  { act: 'III', actName: 'THE MONEY TRAIL', n: 8, title: "Naveen's Theory", status: 'authored',
    blurb: 'Physical evidence, a whiteboard, and a theory nobody wants to be right.' },
  { act: 'III', actName: 'THE MONEY TRAIL', n: 9, title: 'No Safe Exit', status: 'authored',
    blurb: 'A pursuit from the Old City to the industrial outskirts.' },
  { act: 'IV', actName: 'THE MAN BEHIND THE BOARD', n: 10, title: 'Prithviraj', status: 'authored',
    blurb: 'He already knows your name. He wants to know which one is real.' },
  { act: 'IV', actName: 'THE MAN BEHIND THE BOARD', n: 11, title: 'The Truth About R', status: 'authored',
    blurb: 'Keerthy found the second ID. The trust meter decides what happens next.' },
  { act: 'IV', actName: 'THE MAN BEHIND THE BOARD', n: 12, title: 'Checkmate', status: 'authored',
    blurb: 'A trap with two exits. One saves a friend. One saves the case.' },
  { act: 'V', actName: 'DOUBLE GAME', n: 13, title: 'The Last Transaction', status: 'authored',
    blurb: 'Everything you have, assembled into a single extraction window.' },
  { act: 'V', actName: 'DOUBLE GAME', n: 14, title: 'All In', status: 'authored',
    blurb: 'The siege. Stealth, combat, driving and hacking in one unbroken run.' },
  { act: 'V', actName: 'DOUBLE GAME', n: 15, title: 'The Other Player', status: 'authored',
    blurb: 'The money was never the point. Employee ID #0409 was.' },
];

/* -------------------------------------------------------------- positions */
const LOC = {
  desk: [-22, 0, -55],
  lobby: [-24.5, 0, -22],
  bankDoor: [-24.5, 0, -13.6],
  plaza: [19, 0, -18],
  cafeApproach: [60, 0, 9.0],
  keerthy: [60, 0, 2.4],
  playerSeat: [60, 0, 6.4],
  serverDoor: [-48, 0, -82.4],
  serverRoom: [-56, 0, -96],
  restroom: [-68, 0, -36],
  getaway: [118, 0.6, -2],
  deckExit: [96, 0, 8],
  escape: [96, 0, 74],
};

/* ============================================================================
   DIALOGUE — Keerthy Rao
   Every node offers a Playful / Professional / Secretive read on the same
   beat. Trust and Suspicion move in different directions for each.
   ============================================================================ */
const DLG = {
  /* -------- Mission 1: first meeting -------- */
  m1_intro: {
    who: 'KEERTHY RAO',
    line: 'You have been standing near my table for eleven seconds. I counted. Do you want something, or are you just admiring the lighting?',
    options: [
      {
        tag: 'playful', text: 'The lighting. Definitely the lighting. You just happen to be in it.',
        effect: [{ k: 'Trust', v: 8 }, { k: 'Suspicion', v: 1 }],
        next: 'm1_playful', onChoose() { S.keerthy.adjust(8, 1); }
      },
      {
        tag: 'professional', text: 'Akshay Varma, Operations at Apex. You are Keerthy Rao — you ran the Vantara relaunch.',
        effect: [{ k: 'Trust', v: 5 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_prof', onChoose() { S.keerthy.adjust(5, 0); }
      },
      {
        tag: 'secretive', text: 'Nothing. Wrong table. Sorry.',
        effect: [{ k: 'Trust', v: -4 }, { k: 'Suspicion', v: 4 }],
        next: 'm1_shy', onChoose() { S.keerthy.adjust(-4, 4); }
      },
    ]
  },
  m1_playful: {
    who: 'KEERTHY RAO',
    line: 'Mm. Smooth. Rehearsed, but smooth. Sit down before security decides you are a loitering risk — you have the exact posture of one.',
    options: [
      {
        tag: 'playful', text: 'I have been called a loitering risk before. It was at a bank. Long story.',
        effect: [{ k: 'Trust', v: 7 }, { k: 'Suspicion', v: 2 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(7, 2); }
      },
      {
        tag: 'professional', text: 'I will stand. I only came out for air — the trading floor is a furnace today.',
        effect: [{ k: 'Trust', v: 3 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(3, 0); }
      },
      {
        tag: 'secretive', text: 'Actually, I should get back. Long day.',
        effect: [{ k: 'Trust', v: -3 }, { k: 'Suspicion', v: 3 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(-3, 3); }
      },
    ]
  },
  m1_prof: {
    who: 'KEERTHY RAO',
    line: 'You read my name off the guest board. That is either very diligent or very rehearsed. Which is it, Akshay from Operations?',
    options: [
      {
        tag: 'playful', text: 'Both. I am extremely diligent about rehearsing.',
        effect: [{ k: 'Trust', v: 8 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(8, 0); }
      },
      {
        tag: 'professional', text: 'Your relaunch moved ₹300 crore in subscriptions. I noticed the name. That is all.',
        effect: [{ k: 'Trust', v: 6 }, { k: 'Suspicion', v: 1 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(6, 1); }
      },
      {
        tag: 'secretive', text: 'I read a lot of things I probably should not.',
        effect: [{ k: 'Trust', v: 2 }, { k: 'Suspicion', v: 7 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(2, 7); }
      },
    ]
  },
  m1_shy: {
    who: 'KEERTHY RAO',
    line: '…You turned around so fast you knocked over a chair. Sit. Fix the chair. Then tell me who you actually are.',
    options: [
      {
        tag: 'playful', text: 'Right. The chair. I do that everywhere. It is a whole personality trait.',
        effect: [{ k: 'Trust', v: 9 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(9, 0); }
      },
      {
        tag: 'professional', text: 'Akshay Varma. Apex Global, operations floor, fourth year. Sorry about the chair.',
        effect: [{ k: 'Trust', v: 5 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(5, 0); }
      },
      {
        tag: 'secretive', text: 'Nobody. Genuinely nobody. That is the problem.',
        effect: [{ k: 'Trust', v: 3 }, { k: 'Suspicion', v: 5 }],
        next: 'm1_beat3', onChoose() { S.keerthy.adjust(3, 5); }
      },
    ]
  },
  m1_beat3: {
    who: 'KEERTHY RAO',
    line: 'So. Apex Global. Four years in and you still take your coffee break at the cheap café across the road instead of the executive lounge. Why?',
    options: [
      {
        tag: 'playful', text: 'The executive lounge has a violinist. I have never once wanted to hear a violinist at 11 a.m.',
        effect: [{ k: 'Trust', v: 7 }, { k: 'Suspicion', v: 0 }],
        next: 'm1_close', onChoose() { S.keerthy.adjust(7, 0); }
      },
      {
        tag: 'professional', text: 'The lounge is where decisions get announced. Out here is where you hear them being made.',
        effect: [{ k: 'Trust', v: 6 }, { k: 'Suspicion', v: 2 }],
        next: 'm1_close', onChoose() { S.keerthy.adjust(6, 2); }
      },
      {
        tag: 'secretive', text: 'Because nobody in that lounge knows my name. I would like to keep it that way.',
        effect: [{ k: 'Trust', v: 1 }, { k: 'Suspicion', v: 8 }],
        next: 'm1_close', onChoose() { S.keerthy.adjust(1, 8); }
      },
    ]
  },
  m1_close: {
    who: 'KEERTHY RAO',
    line: 'Okay, Akshay Varma. You are either the most boring man in the Financial District, or the best liar I have met this quarter. I will find out which. Same time tomorrow?',
    options: [
      {
        tag: 'playful', text: 'Only if you promise not to count my seconds next time.',
        effect: [{ k: 'Trust', v: 6 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.keerthy.adjust(6, 0); S.keerthy.met = true; S.missions.finishM1('warm'); }
      },
      {
        tag: 'professional', text: 'Same time. And thank you — for not calling security.',
        effect: [{ k: 'Trust', v: 4 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.keerthy.adjust(4, 0); S.keerthy.met = true; S.missions.finishM1('polite'); }
      },
      {
        tag: 'secretive', text: 'Tomorrow works. I would rather you did not look me up in the directory.',
        effect: [{ k: 'Trust', v: 0 }, { k: 'Suspicion', v: 9 }],
        onChoose() { S.keerthy.adjust(0, 9); S.keerthy.met = true; S.missions.finishM1('cold'); }
      },
    ]
  },

  /* -------- Mission 2: the keycard -------- */
  m2_key: {
    who: 'KEERTHY RAO',
    line: 'You have that face. The one people get ninety seconds before they ask me for something. Ask.',
    options: [
      {
        tag: 'professional', text: 'I need badge access to the Vantara gala floor. There is a ledger entry I cannot verify from my desk.',
        effect: [{ k: 'Trust', v: 4 }, { k: 'Suspicion', v: 3 }],
        next: 'm2_key_prof', onChoose() { S.keerthy.adjust(4, 3); }
      },
      {
        tag: 'playful', text: 'I want to see you work. Professionally. In a venue. With a lanyard. Totally normal request.',
        effect: [{ k: 'Trust', v: 7 }, { k: 'Suspicion', v: 2 }],
        next: 'm2_key_play', onChoose() { S.keerthy.adjust(7, 2); }
      },
      {
        tag: 'secretive', text: 'Say I asked for nothing. Say you never saw me today.',
        effect: [{ k: 'Trust', v: -6 }, { k: 'Suspicion', v: 11 }],
        next: 'm2_key_cold', onChoose() { S.keerthy.adjust(-6, 11); }
      },
    ]
  },
  m2_key_prof: {
    who: 'KEERTHY RAO',
    line: 'A ledger entry. Right. Do you know how many men in this city have used the word "ledger" as a pickup line? …Fine. You are the first. Give me your hand.',
    options: [
      {
        tag: 'professional', text: 'Thank you. I will not make you regret this.',
        effect: [{ k: 'Trust', v: 6 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.keerthy.adjust(6, 0); S.missions.grantKeycard(); }
      },
      {
        tag: 'playful', text: 'Careful, Keerthy. That is basically a promise.',
        effect: [{ k: 'Trust', v: 8 }, { k: 'Suspicion', v: 1 }],
        onChoose() { S.keerthy.adjust(8, 1); S.missions.grantKeycard(); }
      },
      {
        tag: 'secretive', text: 'If anyone asks, I was never here.',
        effect: [{ k: 'Trust', v: -3 }, { k: 'Suspicion', v: 8 }],
        onChoose() { S.keerthy.adjust(-3, 8); S.missions.grantKeycard(); }
      },
    ]
  },
  m2_key_play: {
    who: 'KEERTHY RAO',
    line: 'Ha! "Totally normal." You said that with your whole chest. Fine — you can shadow the setup crew. Try not to look like an auditor, because you look exactly like an auditor.',
    options: [
      {
        tag: 'playful', text: 'I will practise my not-an-auditor face in the lift.',
        effect: [{ k: 'Trust', v: 9 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.keerthy.adjust(9, 0); S.missions.grantKeycard(); }
      },
      {
        tag: 'professional', text: 'I appreciate it. Genuinely. More than I can say out loud right now.',
        effect: [{ k: 'Trust', v: 6 }, { k: 'Suspicion', v: 1 }],
        onChoose() { S.keerthy.adjust(6, 1); S.missions.grantKeycard(); }
      },
      {
        tag: 'secretive', text: 'And if someone recognises me in there?',
        effect: [{ k: 'Trust', v: 0 }, { k: 'Suspicion', v: 7 }],
        onChoose() { S.keerthy.adjust(0, 7); S.missions.grantKeycard(); }
      },
    ]
  },
  m2_key_cold: {
    who: 'KEERTHY RAO',
    line: '…Wow. Okay. You know what is worse than a man who wants something? A man who wants something and is too frightened to name it. Take the card. I want to see how deep this goes.',
    options: [
      {
        tag: 'professional', text: 'That is fair. I am sorry.',
        effect: [{ k: 'Trust', v: 5 }, { k: 'Suspicion', v: -2 }],
        onChoose() { S.keerthy.adjust(5, -2); S.missions.grantKeycard(); }
      },
      {
        tag: 'secretive', text: 'You would not like the answer.',
        effect: [{ k: 'Trust', v: 1 }, { k: 'Suspicion', v: 6 }],
        onChoose() { S.keerthy.adjust(1, 6); S.missions.grantKeycard(); }
      },
    ]
  },

  /* -------- Mission 2: after the server room -------- */
  m2_naveen: {
    who: 'NAVEEN (PHONE)',
    line: 'Akshay. AKSHAY. Do not hang up. I ran your little transaction through three different registries and I need you to sit down, because the company behind all of it does not exist, has never existed, and yet it paid my landlord last month.',
    options: [
      {
        tag: 'professional', text: 'Send me everything. Every file, every timestamp. Do not discuss this on this line again.',
        effect: [{ k: 'Trust', v: 0 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.subtitle('AKSHAY', 'Send me everything. Not on this line. Not again.', 3.4); }
      },
      {
        tag: 'playful', text: 'Naveen, breathe. You are doing the thing where you talk like a documentary.',
        effect: [{ k: 'Trust', v: 0 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.subtitle('NAVEEN (PHONE)', 'I AM A DOCUMENTARY. I am a documentary with a magnifying glass and no funding.', 3.6); }
      },
      {
        tag: 'secretive', text: 'Delete the thread. If they are watching the wire, you just put a target on yourself.',
        effect: [{ k: 'Trust', v: 0 }, { k: 'Suspicion', v: 0 }],
        onChoose() { S.subtitle('NAVEEN (PHONE)', '…Okay. Okay. Deleted. Also, you should know: your badge was suspended eight minutes ago.', 4.0); }
      },
    ]
  },
};

/* ============================================================================
   MISSION MANAGER
   ============================================================================ */
class MissionManager {
  constructor() {
    this.index = -1;
    this.step = 0;
    this.objectives = [];
    this.marker = null;
    this.t = 0;
    this.stats = {};
    this.keycard = false;
    this.found = 0;
  }

  get mission() { return CAMPAIGN[this.index]; }

  start(i, silent) {
    this.index = i;
    this.step = 0;
    this.t = 0;
    this.found = 0;
    this.objectives = [];
    const m = CAMPAIGN[i];
    if (!silent) UI.banner(`ACT ${m.act} — ${m.actName}`, m.title, m.blurb);
    if (S.audio) S.audio.objective();
    if (i === 0) this.setupM1();
    else if (i === 1) this.setupM2();
    this.refresh();
  }

  obj(text, done, active) { this.objectives.push({ text, done: !!done, active: !!active }); }

  refresh() {
    const m = this.mission;
    if (!m) return;
    let firstUndone = this.objectives.findIndex(o => !o.done);
    this.objectives.forEach((o, i) => { o.active = i === firstUndone; });
    UI.setObjectives(`ACT ${m.act} — ${m.actName}`, m.title, this.objectives, this.hint || '');
  }

  complete(text) {
    const o = this.objectives.find(x => x.text === text);
    if (!o || o.done) return false;
    o.done = true;
    this.refresh();
    if (S.audio) S.audio.objective();
    return true;
  }

  currentMarker() { return this.marker; }

  /* ------------------------------------------------------------------ M1 */
  setupM1() {
    const P = S.player;
    P.pos[0] = LOC.desk[0]; P.pos[1] = 0; P.pos[2] = LOC.desk[2] + 2.6;
    P.yaw = P.tYaw = S.cam.tYaw = PI;
    P.aimMode = false;
    S.cam.snapTo([P.pos[0], 2.4, P.pos[2] + 5.5], PI, -0.1);
    this.marker = [LOC.desk[0], LOC.desk[2]];
    this.obj('Clock in at your workstation');
    this.obj('Cross the plaza to the café terrace');
    this.obj('Introduce yourself to Keerthy Rao');
    this.hint = 'WASD to move · Shift to sprint · E to interact';
    this.refresh();
    S.cin.play([
      {
        dur: 6.5, who: '', line: 'Hyderabad. 08:41. The Financial District wakes up pretending nothing is wrong.',
        cam: shot(6.5, [-4, 62, 34], [-4, 26, -6], [20, 8, -40], [-30, 14, -70], { fov: 42, dur: 6.5 }),
        onEnter() { if (S.audio) S.audio.music('cinematic'); }
      },
      {
        dur: 5.5, who: 'AKSHAY', line: 'Four years at Apex Global. Two hundred and eleven settled files a month. Not one of them ever came back wrong.',
        cam: shot(5.5, [-22, 1.9, -50.5], [-22, 1.75, -52.6], [-22, 1.5, -56], [-22, 1.35, -58], { fov: 40, dur: 5.5 })
      },
      {
        dur: 5.0, who: 'AKSHAY', line: 'Until this morning.',
        cam: shot(5.0, [-22, 1.7, -52.4], [-20.6, 1.55, -53.4], [-22, 1.35, -57], [-24, 1.3, -57], { fov: 34, dur: 5.0, ease: 'inOutCubic' }),
        onExit() { S.audio.music(S.nightFactor > 0.5 ? 'night' : 'day'); }
      },
    ]);
  }

  tickM1(dt) {
    const P = S.player;
    if (this.step === 0) {
      this.marker = [LOC.desk[0], LOC.desk[2]];
      this.hint = 'Walk to your workstation and press <b>E</b>';
      if (S.flags.deskDone) {
        this.complete('Clock in at your workstation');
        this.step = 1;
        UI.toast('Ledger anomaly flagged · <b>₹4,20,00,000</b> unaccounted', 'bad', 5200);
        this.hint = 'Head east across the plaza to the café terrace';
      }
    } else if (this.step === 1) {
      this.marker = [LOC.cafeApproach[0], LOC.cafeApproach[2]];
      if (V.distXZ(P.pos, [LOC.cafeApproach[0], 0, LOC.cafeApproach[2]]) < 3.4) {
        this.complete('Cross the plaza to the café terrace');
        this.step = 2;
        this.hint = 'Approach the table and press <b>E</b> to speak with her';
      }
    } else if (this.step === 2) {
      this.marker = [LOC.playerSeat[0], LOC.playerSeat[2]];
      if (S.flags.keerthyMet) {
        this.complete('Introduce yourself to Keerthy Rao');
        this.step = 3;
      }
    }
    this.refresh();
  }

  finishM1(tone) {
    S.flags.keerthyMet = true;
    this.stats.tone = tone;
    this.stats.trust = Math.round(S.keerthy.trust);
    this.stats.suspicion = Math.round(S.keerthy.suspicion);
    S.cam.mode = 'dialogue';
    S.cin.play([
      {
        dur: 4.6,
        who: 'KEERTHY RAO',
        line: tone === 'warm' ? 'Same time tomorrow. And Akshay — I always find out which one it is.'
          : tone === 'polite' ? 'Tomorrow then. Try not to knock anything over on the way out.'
            : 'Tomorrow. And Akshay? Everyone gets looked up eventually.',
        cam: shot(4.6, [LOC.playerSeat[0] + 0.4, 1.75, LOC.playerSeat[2] + 1.5], [LOC.keerthy[0] + 1.9, 1.6, LOC.keerthy[2] + 1.2],
          [LOC.keerthy[0], 1.45, LOC.keerthy[2]], [LOC.keerthy[0], 1.45, LOC.keerthy[2]], { fov: 36, dur: 4.6 })
      },
    ], () => {
      S.cam.mode = 'gameplay';
      UI.missionComplete('Monday Morning', [
        { v: `${this.stats.trust}%`, k: 'Keerthy Trust' },
        { v: `${this.stats.suspicion}%`, k: 'Suspicion' },
        { v: fmtTime(S.playTime), k: 'Time' },
        { v: tone === 'warm' ? 'WARM' : tone === 'polite' ? 'CIVIL' : 'GUARDED', k: 'First Impression' },
      ], 'Next: <b>The Missing Amount</b> — a discrepancy worth ₹4.2 crore, and a keycard you should not have.');
      S.pendingNext = 1;
    });
  }

  /* ------------------------------------------------------------------ M2 */
  setupM2() {
    this.marker = [LOC.playerSeat[0], LOC.playerSeat[2]];
    this.obj('Ask Keerthy for gala access');
    this.obj('Reach the Apex server room');
    this.obj('Use Pattern Sight (Q) — find 5 corrupt ledger nodes', false);
    this.obj('Escape the security sweep');
    this.obj('Reach the parking deck');
    this.obj('Lose the pursuit on the streets');
    this.hint = 'Return to the café terrace';
    // move the player out to the terrace approach
    const P = S.player;
    P.pos[0] = 46; P.pos[1] = 0; P.pos[2] = 6;
    P.yaw = P.tYaw = S.cam.tYaw = PI / 2;
    S.cam.snapTo([P.pos[0] - 5, 2.2, P.pos[2]], PI / 2, -0.08);
    this.refresh();
  }

  grantKeycard() {
    if (this.keycard) return;
    this.keycard = true;
    S.flags.keycard = true;
    const door = W.props.find(p => p.id === 'serverDoor');
    if (door) door.locked = false;
    S.cam.mode = 'gameplay';
    UI.toast('Acquired: <b>Vantara Event Keycard</b> · server room access unlocked', 'good', 5200);
    this.complete('Ask Keerthy for gala access');
    this.step = 2;
    this.hint = 'Back inside Apex — the server room is behind the operations floor';
    if (S.audio) S.audio.keycard(true);
  }

  tickM2(dt) {
    const P = S.player;
    if (this.step === 0) {
      this.marker = [LOC.playerSeat[0], LOC.playerSeat[2]];
      this.hint = 'Speak with Keerthy at the terrace';
    } else if (this.step === 2) {
      // head to the server room
      const doorOpen = !W.props.find(p => p.id === 'serverDoor').locked;
      this.marker = doorOpen ? [LOC.serverRoom[0], LOC.serverRoom[2]] : [LOC.serverDoor[0], LOC.serverDoor[2]];
      this.hint = doorOpen ? 'Enter the server room through the operations floor'
        : 'Use the keycard on the server room door';
      const inside = P.pos[0] < -40 && P.pos[2] < -84;
      if (inside) {
        this.complete('Reach the Apex server room');
        this.step = 3;
        this.hint = 'Hold <b>Q</b> for Pattern Sight, then press <b>E</b> on glowing nodes';
        if (!S.flags.serverHint) {
          S.flags.serverHint = true;
          S.subtitle('AKSHAY', 'Five anomalies. Same settlement window, same signatory. Somebody is running a parallel bank inside ours.', 5.0);
        }
      }
    } else if (this.step === 3) {
      this.marker = null;
      const found = W.patternNodes.filter(n => n.found).length;
      this.found = found;
      this.objectives[2].text = `Use Pattern Sight (Q) — find corrupt ledger nodes (${found}/5)`;
      this.refresh();
      if (found >= 3 && !S.flags.sweepStarted) {
        S.flags.sweepStarted = true;
        S.raiseAlert(1);
        S.spawnPursuit(3);
        S.cam.shake(0.5, 0.6);
        if (S.audio) { S.audio.alert(); S.audio.music('tension'); }
        S.subtitle('SECURITY', 'Server room breach — lock down the operations floor. Now!', 3.4);
      }
      if (found >= 5) {
        this.complete(`Use Pattern Sight (Q) — find corrupt ledger nodes (${found}/5)`);
        this.step = 4;
        this.hint = 'Get out — crouch behind cover (<b>C</b>) to break line of sight';
        UI.toast('Evidence secured · <b>5 of 5</b> ledger nodes', 'good', 4200);
        if (S.audio) S.audio.evidence();
      }
    } else if (this.step === 4) {
      // escape to the deck
      this.marker = [LOC.getaway[0], LOC.getaway[2]];
      this.hint = P.vehicle ? 'Drive! Get out of the district' : 'Reach the parking deck and take a car (<b>E</b>)';
      const outside = P.pos[0] > 90 || (P.pos[2] > 20 && P.pos[0] > 60);
      if (outside && !P.vehicle) {
        this.complete('Escape the security sweep');
        this.step = 5;
        this.hint = 'Take the sedan and get clear of the district';
      } else if (P.vehicle && !this.objectives[3].done) {
        this.complete('Escape the security sweep');
        this.step = 5;
      }
    } else if (this.step === 5) {
      this.marker = [LOC.escape[0], LOC.escape[2]];
      this.hint = 'Reach the Golconda Avenue exit · stay off their radar';
      if (!P.vehicle) { this.marker = [LOC.getaway[0], LOC.getaway[2]]; this.hint = 'Get back in a vehicle'; }
      const d = V.distXZ(P.pos, [-44, 0, -64]);
      if (P.vehicle && d > 205 && S.globalAlert < 0.35) {
        this.escapeTimer = (this.escapeTimer || 0) + dt;
        this.hint = `Losing them… <b>${Math.max(0, (3 - this.escapeTimer)).toFixed(1)}s</b>`;
        if (this.escapeTimer > 3) this.finishM2();
      } else { this.escapeTimer = 0; }
    }
    this.refresh();
  }

  finishM2() {
    this.step = 99;
    this.marker = null;
    this.complete('Reach the parking deck');
    this.complete('Lose the pursuit on the streets');
    S.setWanted(0);
    S.missions.stats.evidence = 5;
    const P = S.player;
    if (P.vehicle) P.vehicle.driven = false;
    S.cam.mode = 'gameplay';
    S.cin.play([
      {
        dur: 4.4, who: 'AKSHAY', line: 'Five entries. One signature. And it was authorised eleven years before I ever walked into that building.',
        cam: shot(4.4, [P.pos[0] + 5, 2.6, P.pos[2] + 7], [P.pos[0] + 1.4, 1.9, P.pos[2] + 2.2],
          [P.pos[0], 1.5, P.pos[2]], [P.pos[0], 1.5, P.pos[2]], { fov: 40, dur: 4.4 })
      },
      {
        dur: 4.6, who: 'NAVEEN (PHONE)', line: 'Akshay — your badge was suspended eight minutes ago. Whatever you found, they found you first.',
        cam: shot(4.6, [P.pos[0] + 1.4, 1.9, P.pos[2] + 2.2], [P.pos[0] - 1.2, 1.75, P.pos[2] + 3.4],
          [P.pos[0], 1.5, P.pos[2]], [P.pos[0], 1.5, P.pos[2]], { fov: 33, dur: 4.6, ease: 'inOutCubic' }),
        onEnter() { if (S.audio) { S.audio.phone(); S.audio.music('tension'); } }
      },
      {
        dur: 5.0, who: 'AKSHAY', line: 'Then Akshay Varma is finished. …Which means it is time someone else clocked in.',
        cam: shot(5.0, [P.pos[0] - 1.2, 1.75, P.pos[2] + 3.4], [P.pos[0] - 0.6, 1.68, P.pos[2] + 1.6],
          [P.pos[0], 1.55, P.pos[2]], [P.pos[0], 1.6, P.pos[2]], { fov: 28, dur: 5.0 }),
        onEnter() { S.flags.rTeased = true; }
      },
    ], () => {
      S.cam.mode = 'gameplay';
      UI.missionComplete('The Missing Amount', [
        { v: '5 / 5', k: 'Ledger Nodes' },
        { v: `${Math.round(S.keerthy.trust)}%`, k: 'Keerthy Trust' },
        { v: `${Math.round(S.keerthy.suspicion)}%`, k: 'Suspicion' },
        { v: `${Math.round(S.player.vehicle ? 0 : 0)}${fmtTime(S.playTime)}`, k: 'Elapsed' },
      ], 'Next: <b>Account Suspended</b> — Act I closes with a framed man and a city that has already decided he is guilty.<br><br><span style="color:#8ea3bd;font-size:11.5px">Missions 3–15 are authored in this build\'s campaign data. This vertical slice ships Act I playable end-to-end.</span>');
      S.pendingNext = -1;
      S.sliceComplete = true;
    });
  }

  /* --------------------------------------------------------------- main */
  tick(dt) {
    if (this.index < 0) return;
    this.t += dt;
    if (this.index === 0) this.tickM1(dt);
    else if (this.index === 1) this.tickM2(dt);
  }

  advance() {
    if (S.pendingNext === -1) { S.showSliceEnd(); return; }
    if (S.pendingNext !== undefined && S.pendingNext !== null) {
      const n = S.pendingNext;
      S.pendingNext = null;
      this.start(n);
    }
  }

  skipMission() {
    const n = this.index + 1;
    if (n >= CAMPAIGN.length || CAMPAIGN[n].status !== 'playable') { S.showSliceEnd(); return; }
    this.start(n);
  }

  /** Interaction handler for the current mission's dialogue beats. */
  talkKeerthy() {
    if (this.index === 0 && this.step >= 2 && !S.flags.keerthyMet) {
      S.beginDialogue('m1_intro');
    } else if (this.index === 1 && this.step === 0 && !this.keycard) {
      if (!S.keerthy.met) { S.subtitle('KEERTHY RAO', 'We have met, yes? You are the chair-knocker from the terrace.', 3.4); S.keerthy.met = true; }
      S.beginDialogue('m2_key');
    } else {
      const lines = S.keerthy.suspicion > 60
        ? ['You keep disappearing mid-sentence. Do you know how obvious that is?',
          'I looked you up. Two addresses. Two phone numbers. One of them does not exist.',
          'Whatever you are into, Akshay — do not make me the reason it goes wrong.']
        : S.keerthy.trust > 60
          ? ['You came back. I told myself you would not.',
            'Sit. I ordered you the terrible filter coffee you pretend to like.',
            'There is a gala on Thursday. I could put a name on the list. Yours, presumably.']
          : ['Still haunting my terrace?', 'The event is Thursday. Do not be late, whoever you turn out to be.',
            'You have the strangest tells. You look left before you lie.'];
      S.subtitle('KEERTHY RAO', pick(lines), 3.6);
    }
  }
}
