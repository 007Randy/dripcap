import gulp from 'gulp';
import babel from 'gulp-babel';
import electron from 'gulp-atom-electron';
import symdest from 'gulp-symdest';
import replace from 'gulp-replace';
import zip from 'gulp-vinyl-zip';
import sequence from 'gulp-sequence';
import mocha from 'gulp-mocha';
import preservetime from 'gulp-preservetime';
import packager from 'electron-packager';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import rimraf from 'rimraf';
import {
  exec
} from 'child_process';
import jasmine from 'gulp-jasmine';
import npm from 'npm';
import pkg from './package.json';
import EventEmitter from 'events';

EventEmitter.defaultMaxListeners = 2048;

gulp.task('mocha', () => {
  gulp.src(['uispec/*.es', '**/uispec/*.es'], {
      read: false
    })
    .pipe(mocha({
      reporter: 'list',
      require: ['babel-register'],
      timeout: 30000,
      slow: 10000,
      retries: 3
    }))
    .once('error', () => {
      process.exit(1);
    })
    .once('end', () => {
      process.exit();
    });
});

gulp.task('babel', () =>
  gulp.src('./src/**/*.es', {
    base: './src/'
  })
  .pipe(babel())
  .pipe(gulp.dest('./.build/js/'))
  .pipe(preservetime())
);

gulp.task('copy', () =>
  gulp.src([
    './package.json',
    './src/*.html',
    './src/*.less'
  ])
  .pipe(gulp.dest('./.build'))
  .pipe(preservetime())
);

gulp.task('copypkg', () =>
  gulp.src([
    './packages/**/*',
    './dripcap/**/*',
    './paperfilter/**/*'
  ], {
    base: './'
  })
  .pipe(gulp.dest('./.build/'))
  .pipe(preservetime())
);

gulp.task('npm', ['copypkg'], async function() {
  await new Promise(res => npm.load({
    production: true,
    depth: 0
  }, res));

  await new Promise(function(res) {
    npm.prefix = './.build/';
    return npm.commands.uninstall(['dripcap'], res);
  });

  await new Promise(function(res) {
    npm.prefix = './.build/';
    return npm.commands.install([], res);
  });

  let dirs = [];
  glob.sync('./.build/packages/**/package.json').forEach(function(conf) {
    let cwd = path.dirname(conf);
    dirs.push(cwd);
  });

  for (let cwd of dirs) {
    await new Promise(function(res) {
      npm.prefix = cwd;
      npm.commands.install([], res);
    });
  }

  await new Promise(function(res) {
    rimraf('./.build/dripcap', () => {
      rimraf('./.build/paperfilter', res);
    });
  });
});

gulp.task('linux', ['build'], cb =>
  gulp.src('./.build/**')
  .pipe(electron({
    version: pkg.devDependencies.electron,
    platform: 'linux',
    arch: 'x64',
    token: process.env['ELECTRON_GITHUB_TOKEN']
  }))
  .pipe(zip.dest('dripcap-linux-amd64.zip'))

);

gulp.task('debian-pkg', cb =>
  gulp.src('./debian/**', {
    base: './debian/'
  })
  .pipe(replace('{{DRIPCAP_VERSION}}', pkg.version, {
    skipBinary: true
  }))
  .pipe(gulp.dest('./.debian/'))

);

gulp.task('debian-bin', ['copy', 'babel', 'copypkg', 'npm'], cb =>
  gulp.src('./.build/**')
  .pipe(electron({
    version: pkg.devDependencies.electron,
    platform: 'linux',
    arch: 'x64',
    token: process.env['ELECTRON_GITHUB_TOKEN']
  }))
  .pipe(symdest('./.debian/usr/share/dripcap'))

);

gulp.task('debian', sequence(
  'debian-bin',
  'debian-pkg'
));

gulp.task('darwin', ['build'], cb => {
  let options = {
    dir: __dirname + '/.build',
    version: pkg.devDependencies.electron,
    out: __dirname + '/.builtapp',
    platform: 'darwin',
    'osx-sign': true,
    icon: __dirname + '/images/dripcap.icns'
  };
  return new Promise((res, rej) => {
    packager(options, (err, appPaths) => {
      if (err != null) {
        rej(err);
      } else {
        res(appPaths);
      }
    });
  });
});

gulp.task('win32', ['build'], cb => {
  let options = {
    dir: __dirname + '/.build',
    version: pkg.devDependencies.electron,
    out: __dirname + '/.builtapp',
    platform: 'win32',
    arch: 'x64',
    icon: __dirname + '/images/dripcap.ico',
    win32metadata: {
      CompanyName: 'dripcap.org',
      FileDescription: '☕️ Caffeinated Packet Analyzer',
      ProductName: 'Dripcap'
    }
  };
  return new Promise((res, rej) => {
    packager(options, (err, appPaths) => {
      if (err != null) {
        rej(err);
      } else {
        res(appPaths);
      }
    });
  });
});

gulp.task('default', ['build'], cb => {
  let env = {
    DRIPCAP_ATTACH: '1'
  };
  exec('electron --enable-logging .build', {
    env: Object.assign(env, process.env)
  }, cb);
});

gulp.task('build', sequence(
  ['babel', 'copy', 'copypkg'],
  'npm'
));
