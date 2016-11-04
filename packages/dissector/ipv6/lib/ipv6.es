import {Layer, Item, Value, StreamChunk} from 'dripcap';
import {Flags, Enum} from 'dripcap/utils';
import {IPv6Address} from 'dripcap/ipv6';

export default class IPv6Dissector {
  static get namespaces() {
    return ['::Ethernet::<IPv6>'];
  }

  analyze(packet, parentLayer) {
    let layer = {
      items: [],
      attrs: {}
    };
    layer.namespace = '::Ethernet::IPv6';
    layer.name = 'IPv6';
    layer.id = 'ipv6';

    let version = parentLayer.payload.readUInt8(0) >> 4;
    layer.items.push({
      name: 'Version',
      value: version,
      range: '0:1'
    });
    layer.attrs.version = version;

    let trafficClass =
      ((parentLayer.payload.readUInt8(0, true) & 0b00001111) << 4) |
      ((parentLayer.payload.readUInt8(1, true) & 0b11110000) >> 4);
    layer.items.push({
      name: 'Traffic Class',
      value: trafficClass,
      range: '0:2'
    });
    layer.attrs.trafficClass = trafficClass;

    let flowLevel = parentLayer.payload.readUInt16BE(2) |
      ((parentLayer.payload.readUInt8(1, true) & 0b00001111) << 16);
    layer.items.push({
      name: 'Flow Label',
      value: flowLevel,
      range: '1:4'
    });
    layer.attrs.flowLevel = flowLevel;

    let payloadLength = parentLayer.payload.readUInt16BE(4);
    layer.items.push({
      name: 'Payload Length',
      value: payloadLength,
      range: '4:6'
    });
    layer.attrs.payloadLength = payloadLength;

    let nextHeader = parentLayer.payload.readUInt8(6);
    let nextHeaderRange = '6:7';

    layer.items.push({
      name: 'Next Header',
      value: Enum(protocolTable, nextHeader),
      range: nextHeaderRange
    });

    let hopLimit = parentLayer.payload.readUInt8(7, true);
    layer.items.push({
      name: 'Hop Limit',
      value: hopLimit,
      range: '7:8'
    });
    layer.attrs.hopLimit = hopLimit;

    let source = IPv6Address(parentLayer.payload.slice(8, 24));
    layer.items.push({
      name: 'Source IP Address',
      value: source,
      range: '8:24'
    });
    layer.attrs.src = source;

    let destination = IPv6Address(parentLayer.payload.slice(24, 40));
    layer.items.push({
      name: 'Destination IP Address',
      value: destination,
      range: '24:40'
    });
    layer.attrs.dst = destination;

    let offset = 40;
    let ext = true;

    while (ext) {
      let optlen = 0;
      let item = null;
      switch (nextHeader) {
        case 0:
        case 60: // Hop-by-Hop Options, Destination Options
          let extLen = (parentLayer.payload.readUInt8(offset + 1) + 1) * 8;
          let name = (nextHeader === 0) ? 'Hop-by-Hop Options' : 'Destination Options';
          item = {
            name: name,
            range: `${offset}:${offset + extLen}`,
            items: [{
              name: 'Hdr Ext Len',
              value: parentLayer.payload.readUInt8(offset + 1),
              range: `${offset + 1}:${offset + 2}`
            }, {
              name: 'Options and Padding',
              value: parentLayer.payload.slice(offset + 2, offset + extLen),
              range: `${offset + 2}:${offset + extLen}`
            }]
          };
          optlen = extLen;
          break;
          // TODO:
          // case 43  # Routing
          // case 44  # Fragment
          // case 51  # Authentication Header
          // case 50  # Encapsulating Security Payload
          // case 135 # Mobility
        case 59: // No Next Header
        default:
          ext = false
          continue
      }

      nextHeader = parentLayer.payload.readUInt8(offset);
      nextHeaderRange = `${offset}:${offset + 1}`;
      item.items.unshift({
        name: 'Next Header',
        value: Enum(protocolTable, nextHeader),
        range: nextHeaderRange
      });
      layer.items.push(item);

      offset += optlen;
    }

    let protocol = Enum(protocolTable, nextHeader);
    let protocolName = protocolTable[nextHeader];
    if (protocolName != null) {
      layer.namespace = `::Ethernet::IPv6::<${protocolName}>`;
    }

    layer.items.push({
      name: 'Protocol',
      value: protocol,
      data: nextHeaderRange
    });
    layer.attrs.protocol = protocol;

    layer.range = offset + ':';
    layer.payload = parentLayer.payload.slice(offset);

    layer.items.push({
      name: 'Payload',
      value: layer.payload,
      range: offset + ':'
    });

    layer.summary = `${source.data} -> ${destination.data}`;
    if (protocolName != null) {
      layer.summary = `[${protocolName}] ` + layer.summary;
    }

    return new Layer(layer);
  }
}

let protocolTable = {
  0x00: 'HOPOPT',
  0x01: 'ICMP',
  0x02: 'IGMP',
  0x03: 'GGP',
  0x04: 'IP-in-IP',
  0x05: 'ST',
  0x06: 'TCP',
  0x07: 'CBT',
  0x08: 'EGP',
  0x09: 'IGP',
  0x0A: 'BBN-RCC-MON',
  0x0B: 'NVP-II',
  0x0C: 'PUP',
  0x0D: 'ARGUS',
  0x0E: 'EMCON',
  0x0F: 'XNET',
  0x10: 'CHAOS',
  0x11: 'UDP',
  0x12: 'MUX',
  0x13: 'DCN-MEAS',
  0x14: 'HMP',
  0x15: 'PRM',
  0x16: 'XNS-IDP',
  0x17: 'TRUNK-1',
  0x18: 'TRUNK-2',
  0x19: 'LEAF-1',
  0x1A: 'LEAF-2',
  0x1B: 'RDP',
  0x1C: 'IRTP',
  0x1D: 'ISO-TP4',
  0x1E: 'NETBLT',
  0x1F: 'MFE-NSP',
  0x20: 'MERIT-INP',
  0x21: 'DCCP',
  0x22: '3PC',
  0x23: 'IDPR',
  0x24: 'XTP',
  0x25: 'DDP',
  0x26: 'IDPR-CMTP',
  0x27: 'TP++',
  0x28: 'IL',
  0x29: 'IPv6',
  0x2A: 'SDRP',
  0x2B: 'Route',
  0x2C: 'Frag',
  0x2D: 'IDRP',
  0x2E: 'RSVP',
  0x2F: 'GRE',
  0x30: 'MHRP',
  0x31: 'BNA',
  0x32: 'ESP',
  0x33: 'AH',
  0x34: 'I-NLSP',
  0x35: 'SWIPE',
  0x36: 'NARP',
  0x37: 'MOBILE',
  0x38: 'TLSP',
  0x39: 'SKIP',
  0x3A: 'ICMP',
  0x3B: 'NoNxt',
  0x3C: 'Opts',
  0x3E: 'CFTP',
  0x40: 'SAT-EXPAK',
  0x41: 'KRYPTOLAN',
  0x42: 'RVD',
  0x43: 'IPPC',
  0x45: 'SAT-MON',
  0x46: 'VISA',
  0x47: 'IPCU',
  0x48: 'CPNX',
  0x49: 'CPHB',
  0x4A: 'WSN',
  0x4B: 'PVP',
  0x4C: 'BR-SAT-MON',
  0x4D: 'SUN-ND',
  0x4E: 'WB-MON',
  0x4F: 'WB-EXPAK',
  0x50: 'ISO-IP',
  0x51: 'VMTP',
  0x52: 'SECURE-VMTP',
  0x53: 'VINES',
  0x54: 'TTP',
  0x54: 'IPTM',
  0x55: 'NSFNET-IGP',
  0x56: 'DGP',
  0x57: 'TCF',
  0x58: 'EIGRP',
  0x59: 'OSPF',
  0x5A: 'Sprite-RPC',
  0x5B: 'LARP',
  0x5C: 'MTP',
  0x5D: 'AX.25',
  0x5E: 'IPIP',
  0x5F: 'MICP',
  0x60: 'SCC-SP',
  0x61: 'ETHERIP',
  0x62: 'ENCAP',
  0x64: 'GMTP',
  0x65: 'IFMP',
  0x66: 'PNNI',
  0x67: 'PIM',
  0x68: 'ARIS',
  0x69: 'SCPS',
  0x6A: 'QNX',
  0x6B: 'A/N',
  0x6C: 'IPComp',
  0x6D: 'SNP',
  0x6E: 'Compaq-Peer',
  0x6F: 'IPX-in-IP',
  0x70: 'VRRP',
  0x71: 'PGM',
  0x73: 'L2TP',
  0x74: 'DDX',
  0x75: 'IATP',
  0x76: 'STP',
  0x77: 'SRP',
  0x78: 'UTI',
  0x79: 'SMP',
  0x7A: 'SM',
  0x7B: 'PTP',
  0x7C: 'IS-IS',
  0x7D: 'FIRE',
  0x7E: 'CRTP',
  0x7F: 'CRUDP',
  0x80: 'SSCOPMCE',
  0x81: 'IPLT',
  0x82: 'SPS',
  0x83: 'PIPE',
  0x84: 'SCTP',
  0x85: 'FC',
  0x86: 'RSVP-E2E-IGNORE',
  0x87: 'RFC6275',
  0x88: 'UDPLite',
  0x89: 'MPLS-in-IP',
  0x8A: 'manet',
  0x8B: 'HIP',
  0x8C: 'Shim6',
  0x8D: 'WESP',
  0x8E: 'ROHC',
};
