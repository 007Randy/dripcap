import $ from 'jquery';
import riot from 'riot';
import Component from 'dripcap-core/component';
import Panel from 'dripcap-core/panel';
import {
  KeyBind,
  Package,
  Action
} from 'dripcap-core';

export default class PreferencesDialog {
  async activate() {
    await Package.load('main-view');
    await Package.load('modal-dialog');

    this.comp = await Component.create(`${__dirname}/../tag/*.tag`);
    this.panel = new Panel();
    let n = $('<div>').appendTo($('body'));
    this._view = riot.mount(n[0], 'preferences-dialog')[0];
    $(this._view.root).find('.content').append($('<div class="root-container" />').append(this.panel.root));

    Action.on('core:preferences', () => {
      this._view.show();
      this._view.update();
    });
  }

  async deactivate() {
    KeyBind.unbind('enter', '[riot-tag=preferences-dialog] .content');
    this._view.unmount();
    this.comp.destroy();
  }
}
