import {Layer, Item, Value} from 'dripcap';
import {IPv4Host} from 'driptool/ipv4';
import {IPv6Host} from 'driptool/ipv6';

export default class UDPDissector {
  static get namespaces() {
    return [/::Ethernet::\w+::<UDP>/];
  }

  analyze(packet, parentLayer) {
    let layer = {
      items: [],
      attrs: {}
    };
    layer.namespace = parentLayer.namespace.replace('<UDP>', 'UDP');
    layer.name = 'UDP';
    layer.id = 'udp';

    let source = parentLayer.payload.readUInt16BE(0);
    layer.items.push({
      name: 'Source port',
      id: 'srcPort',
      range: '0:2'
    });
    layer.attrs.srcPort = source;

    let destination = parentLayer.payload.readUInt16BE(2);
    layer.items.push({
      name: 'Destination port',
      id: 'dstPort',
      range: '2:4'
    });
    layer.attrs.dstPort = destination;

    let srcAddr = parentLayer.item('src');
    let dstAddr = parentLayer.item('dst');
    if (srcAddr.type === 'dripcap/ipv4/addr') {
      layer.attrs.src = IPv4Host(srcAddr.data, source);
      layer.attrs.dst = IPv4Host(dstAddr.data, destination);
    } else if (srcAddr.type === 'dripcap/ipv6/addr') {
      layer.attrs.src = IPv6Host(srcAddr.data, source);
      layer.attrs.dst = IPv6Host(dstAddr.data, destination);
    }

    let length = parentLayer.payload.readUInt16BE(4);
    layer.items.push({
      name: 'Length',
      id: 'len',
      range: '4:6'
    });
    layer.attrs.len = length;

    let checksum = parentLayer.payload.readUInt16BE(6);
    layer.items.push({
      name: 'Checksum',
      id: 'checksum',
      range: '6:8'
    });
    layer.attrs.checksum = checksum;

    layer.range = '8:'+ length;
    layer.payload = parentLayer.payload.slice(8, length);

    layer.items.push({
      name: 'Payload',
      id: 'payload',
      range: '8:' + length
    });

    layer.summary = `${layer.attrs.src.data} -> ${layer.attrs.dst.data}`;
    return new Layer(layer);
  }
}
