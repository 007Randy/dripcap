import $ from 'jquery';
import fs from 'fs';
import {remote} from 'electron';
const {MenuItem} = remote;
const {dialog} = remote;
import {
  Session,
  Menu,
  KeyBind,
  PubSub,
  Logger
} from 'dripcap';

class Pcap {
  constructor(path) {
    let data = fs.readFileSync(path);
    if (data.length < 24) { throw new Error('too short global header'); }

    let magicNumber = data.readUInt32BE(0, true);
    switch (magicNumber) {
      case 0xd4c3b2a1:
        var littleEndian = true;
        var nanosec = false;
        break;
      case 0xa1b2c3d4:
        littleEndian = false;
        nanosec = false;
        break;
      case 0x4d3cb2a1:
        littleEndian = true;
        nanosec = true;
        break;
      case 0xa1b23c4d:
        littleEndian = false;
        nanosec = true;
        break;
      default:
        throw new Error('wrong magic_number');
    }

    if (littleEndian) {
      this.versionMajor = data.readUInt16LE(4, true);
      this.versionMinor = data.readUInt16LE(6, true);
      this.thiszone = data.readInt16LE(8, true);
      this.sigfigs = data.readUInt32LE(12, true);
      this.snaplen = data.readUInt32LE(16, true);
      this.network = data.readUInt32LE(20, true);
    } else {
      this.versionMajor = data.readUInt16BE(4, true);
      this.versionMinor = data.readUInt16BE(6, true);
      this.thiszone = data.readInt16BE(8, true);
      this.sigfigs = data.readUInt32BE(12, true);
      this.snaplen = data.readUInt32BE(16, true);
      this.network = data.readUInt32BE(20, true);
    }

    this.packets = [];

    let offset = 24;
    while (offset < data.length) {
      let tsSec = 0, tsUsec = 0, inclLen = 0, origLen = 0;

      if (data.length - offset < 16) { throw new Error('too short packet header'); }
      if (littleEndian) {
        tsSec = data.readUInt32LE(offset, true);
        tsUsec = data.readUInt32LE(offset + 4, true);
        inclLen = data.readUInt32LE(offset + 8, true);
        origLen = data.readUInt32LE(offset + 12, true);
      } else {
        tsSec = data.readUInt32BE(offset, true);
        tsUsec = data.readUInt32BE(offset + 4, true);
        inclLen = data.readUInt32BE(offset + 8, true);
        origLen = data.readUInt32BE(offset + 12, true);
      }

      offset += 16;
      if (data.length - offset < inclLen) { throw new Error('too short packet body'); }

      let payload = data.slice(offset, offset + inclLen);

      let pakcet = {
        ts_sec: tsSec,
        ts_nsec: nanosec ? tsUsec : tsUsec * 1000,
        length: origLen,
        payload: payload
      };

      this.packets.push(pakcet);
      offset += inclLen;
    }
  }
}

export default class PcapFile {
  async activate() {
    KeyBind.bind('command+o', '!menu', 'pcap-file:open');

    this.fileMenu = function(menu, e) {
      menu.append(new MenuItem({
        label: 'Import Pcap File...',
        accelerator: KeyBind.get('!menu', 'pcap-file:open'),
        click: () => { return PubSub.emit('pcap-file:open'); }
      }));
      return menu;
    };

    Menu.registerMain('File', this.fileMenu, 5);

    PubSub.on('pcap-file:open', () => {
      let path = dialog.showOpenDialog(remote.getCurrentWindow(), {filters: [{name: 'PCAP File', extensions: ['pcap']}]});
      if (path != null) {
        this._open(path[0])
      }
    });
  }

  async _open(path) {
    let pcap = new Pcap(path);
    let sess = await Session.create();
    for (let err of sess.errors) {
      //Logger.error(err.message);
    }
    PubSub.emit('core:session-added', sess);
    sess.on('status', stat => {
      PubSub.pub('core:capturing-status', stat);
    });
    sess.on('log', log => {
      PubSub.pub('core:log', {
        level: log.level,
        message: log.message,
        timestamp: new Date(),
        data: log.data
      });
    });
    sess.analyze(pcap.packets);
    let start = new Date();
    sess.on('status', stat => {
      if (stat.packets > 0 && stat.queue === 0) {
        let elapsed = ((new Date()).getTime() - start.getTime()) / 1000.0;
        PubSub.pub('core:log', {
          level: 'debug',
          message: `pcap-file: ${stat.packets} packets ${elapsed} sec`,
          timestamp: new Date()
        });
      }
    });
  }

  async deactivate() {
    PubSub.removeAllListeners('pcap-file:open');
    KeyBind.unbind('command+o', '!menu', 'pcap-file:open');
    Menu.unregisterMain('File', this.fileMenu);
  }
}
