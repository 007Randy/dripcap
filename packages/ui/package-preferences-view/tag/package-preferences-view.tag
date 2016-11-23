<package-preferences-view-item>
<li class="packages border">
  <p class="head">{ opts.pkg.name }
    <i class="text-label">{ opts.pkg.description }</i>
  </p>
  <ul class="items">
    <li>
      <label>
        <input type="checkbox" name="enabled" onclick={ setEnabled } checked={ opts.pkg.config.get('enabled') }>
        Enabled
      </label>
    </li>
    <li>
      <div class="preferences"></div>
    </li>
    <li if={ opts.pkg.userPackage }>
      <input type="button" value="Uninstall" onclick={ uninstallPackage }>
    </li>
  </ul>
</li>

<script>
  import $ from 'jquery';

  this.on('mount', () => {
    this.pref = $(this.root).find('.preferences').empty();
    let elem = opts.pkg.renderPreferences();
    if (elem) {
      this.pref.append(elem);
    }
  });
</script>
</package-preferences-view-item>

<package-preferences-view>
<ul>
  <package-preferences-view-item each={ pkg in packageList } pkg={ pkg }></package-preferences-view-item>
</ul>

<script>
  import _ from 'underscore';
  import { Package } from 'dripcap-core';

  this.setEnabled = e => {
    let {pkg} = e.item;
    let enabled = $(e.currentTarget).is(':checked');
    pkg.config.set('enabled', enabled);
    if (enabled) {
      pkg.activate();
    } else {
      pkg.deactivate();
    }
  };

  this.uninstallPackage = e => {
    let {pkg} = e.item;
    if (pkg.config.get('enabled')) {
      pkg.deactivate();
    }
    Package.uninstall(pkg.name).then(() => {
      $(e.target).parents('li.packages').fadeOut(400, () => {
        this.packageList = _.without(this.packageList, pkg);
        this.update();
      });
    });
  };
</script>

<style type="text/less" scoped>
  :scope {
    padding: 18px;
    overflow-y: scroll;
    li.packages {
      padding: 15px;
      margin: 15px auto;
      border-radius: 5px;
      p.head {
        margin: 0;
        i {
          float: right;
          width: 50%;
          text-align: right;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }
    }
    ul.items {
      padding: 10px 0 0;
      li {
        padding: 5px 0;
        display: inline;
        input {
          max-width: 120px;
          margin: 0 10px;
        }
      }
      .preferences {
        margin: 20px 10px 10px;
      }
    }
    ul {
      list-style: none;
      padding: 0;
    }
  }
</style>

</package-preferences-view>
