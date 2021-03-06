import path from 'path';
import glob from 'glob';
import npm from 'npm';
import semver from 'semver';
import fs from 'fs';
import zlib from 'zlib';
import tar from 'tar';
import url from 'url';
import dns from 'dns';
import request from 'request';
import rimraf from 'rimraf';
import _ from 'underscore';
import { rollup } from 'rollup';
import { EventEmitter } from 'events';
import Env from './env';

class Package extends EventEmitter {
  constructor(jsonPath, profile) {
    super();
    this._activated = false;

    this.path = path.dirname(jsonPath);
    this.userPackage = path.normalize(this.path).startsWith(path.normalize(Env.userPackagePath));

    let info = JSON.parse(fs.readFileSync(jsonPath));

    if (info.name != null) {
      this.name = info.name;
    } else {
      throw new Error('package name required');
    }

    if ((info._dripcap != null) && (info._dripcap.name != null)) {
      this.name = info._dripcap.name;
    }

    if (info.main != null) {
      this.main = info.main;
    } else {
      throw new Error('package main required');
    }

    this.description = info.description != null ? info.description : '';
    this.version = info.version != null ? info.version : '0.0.1';
    this.config = profile.getPackageConfig(this.name);
    this._reset();
  }

  _reset() {
    return this._promise =
      new Promise(resolve => {
        return this._resolve = resolve;
      })
      .then(() => {
        return new Promise((resolve, reject) => {
          let req = path.resolve(this.path, this.main);
          rollup({
            entry: req,
            external: ['dripcap'],
            acorn: {
              ecmaVersion: 8
            },
            plugins: [{
              name: 'globalPaths',
              banner: `require('module').globalPaths.push('${this.path}/node_modules')`
            }],
            onwarn: (e) => {}
          }).then((bundle) => {
            const result = bundle.generate({
              format: 'cjs'
            });
            let module = {exports: {}};

            try {
              new Function('module', '__dirname', result.code)(module, path.dirname(req));
              let klass = module.exports;
              this.root = new klass(this);
              let res = this.root.activate();
              if (res instanceof Promise) {
                return res.then(() => resolve(this));
              } else {
                return resolve(this);
              }
            } catch (e) {
              reject(e);
              return;
            }
          });
        });
      });
  }

  load() {
    return this._promise;
  }

  activate() {
    if (this._activated) return;
    this._activated = true;
    if (!this.path.includes('/app.asar/')) {
      this._watcher = fs.watch(this.path, {recursive: true}, _.debounce(() => {
        this.emit('file-updated');
      }, 100));
    }
    return this._resolve();
  }

  renderPreferences() {
    if ((this.root != null) && (this.root.renderPreferences != null)) {
      return this.root.renderPreferences();
    } else {
      return null;
    }
  }

  async deactivate() {
    if (!this._activated) return;
    this._activated = false;
    await this.load();
    if (this._watcher) this._watcher.close();
    return new Promise((resolve, reject) => {
      if (this.root != null) {
        try {
          this.root.deactivate();
          this.root = null;
          this._reset();
          for (let key in require.cache) {
            if (key.startsWith(this.path)) {
              delete require.cache[key];
            }
          }
        } catch (e) {
          reject(e);
          return;
        }
      }
      return resolve(this);
    });
  }
}

export default class PackageHub {
  constructor(pubsub, profile) {
    this._pubsub = pubsub;
    this._profile = profile;
    this.uninstall = this.uninstall.bind(this);
    this.list = {};
    this.triggerlLoaded = _.debounce(() => {
      this._pubsub.pub('core:package-loaded');
    }, 500);
  }

  getConfigData() {
    let data = {
      _: this._profile.getData()
    };
    for (let pkg in this.list) {
      data[pkg] = this._profile.getPackageConfig(pkg).getData();
    }
    return data;
  }

  load(name) {
    let pkg = this.list[name];
    if (pkg == null) {
      throw new Error(`package not found: ${name}`);
    }
    return pkg.load();
  }

  unload(name) {
    let pkg = this.list[name];
    if (pkg == null) {
      throw new Error(`package not found: ${name}`);
    }
    return pkg.deactivate();
  }

  updatePackageList() {
    let paths = glob.sync(Env.packagePath + '/**/package.json');
    paths = paths.concat(glob.sync(Env.userPackagePath + '/**/package.json'));

    let packages = {};
    for (let p of paths) {
      if (!p.split(path.sep).includes('node_modules')) {
        let pkg = new Package(p, this._profile);
        let loaded = packages[pkg.name];
        if (loaded == null || path.normalize(pkg.path).startsWith(path.normalize(Env.userPackagePath))) {
          packages[pkg.name] = pkg;
        }
      }
    }

    let loadedPackages = {};
    for (let name in packages) {
      let pkg = packages[name];
      try {
        loadedPackages[pkg.name] = true;

        let loaded = this.list[pkg.name];
        if (loaded != null) {
          if (loaded.path !== pkg.path) {
            console.warn(`package name conflict: ${pkg.name}`);
            continue;
          } else if (semver.gte(loaded.version, pkg.version)) {
            continue;
          } else {
            loaded.deactivate();
          }
        }

        this.list[pkg.name] = pkg;
      } catch (e) {
        console.warn(`failed to load ${pkg.name}/package.json : ${e}`);
      }
    }

    for (let k in this.list) {
      let pkg = this.list[k];
      if (!loadedPackages[pkg.name]) {
        delete this.list[k];
      } else if (pkg.config.get('enabled')) {
        pkg.activate();
        pkg.load().then(() => {
          process.nextTick(() => this.triggerlLoaded());
        });
        pkg.removeAllListeners();
        pkg.on('file-updated', () => {
          this._pubsub.pub('core:package-file-updated', pkg.name);
          if (this._profile.getConfig('auto-reload') === 'package') {
            pkg.deactivate().then(() => {
              process.nextTick(() => this.updatePackageList());
            });
          }
        });
      }
    }

    this._pubsub.pub('core:package-list-updated', this.list);
  }

  resolveRegistry(hostname) {
    return new Promise((res, rej) => {
      dns.resolveSrv('_dripcap._https.' + hostname, (err, data) => {
        if (err) {
          rej(err);
        } else {
          let str = '';
          if (data.length > 0) {
            str = url.format({
              protocol: 'https',
              hostname: data[0].name,
              port: data[0].port
            });
          }
          res(str);
        }
      })
    });
  }

  async install(name) {
    let registry = this._profile.getConfig('package-registry');
    let pkgpath = path.join(Env.userPackagePath, name);
    let host = await this.resolveRegistry(registry);

    await new Promise((res) => {
      npm.load({production: true}, res);
    });

    let data = await new Promise((res) => {
      request(host + '/registry/' + name, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          res(JSON.parse(body));
        } else {
          throw e;
        }
      });
    });

    let vars = Object.keys(data.versions);
    vars.sort(semver.rcompare);
    if (this.list[name] != null && semver.gte(this.list[name].version, vars[0])) {
      throw new Error(`Package ${name} is already installed`);
    }
    let pkg = data.versions[vars[0]];
    if ((pkg.engines != null) && (pkg.engines.dripcap != null)) {
      let ver = pkg.engines.dripcap;
      if (semver.satisfies(Env.version, ver)) {
        if ((pkg.dist != null) && (pkg.dist.tarball != null)) {
        } else {
          throw new Error('Tarball not found');
        }
      } else {
        throw new Error('Dripcap version mismatch');
      }
    } else {
      throw new Error('This package is not for dripcap');
    }

    let tarurl = pkg.dist.tarball;

    let e = await new Promise(res => fs.stat(pkgpath, e => res(e)));
    if (e == null) {
      await this.uninstall(name);
    }

    await new Promise(function(res) {
      let gunzip = zlib.createGunzip();
      let extractor = tar.Extract({
        path: pkgpath,
        strip: 1
      });
      request(tarurl).pipe(gunzip).pipe(extractor).on('finish', () => res());
    });

    await new Promise(function(res) {
      let jsonPath = path.join(pkgpath, 'package.json');
      return fs.readFile(jsonPath, function(err, data) {
        if (err) {
          throw err;
        }
        let json = JSON.parse(data);
        json['_dripcap'] = {
          name,
          registry
        };
        fs.writeFile(jsonPath, JSON.stringify(json, null, '  '), function(err) {
          if (err) {
            throw err;
          }
          res();
        });
      });
    });

    await new Promise(res => {
      return npm.commands.install(pkgpath, [], () => {
        res();
        this.updatePackageList();
      });
    });
  }

  uninstall(name) {
    let pkgpath = path.join(Env.userPackagePath, name);
    return new Promise(res => {
      rimraf(pkgpath, err => {
        this.updatePackageList();
        if (err != null) {
          throw err;
        }
        res();
      });
    });
  }
}
