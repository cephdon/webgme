/*globals require, console, __dirname*/

var gulp = require('gulp'),
    jshint = require('gulp-jshint'),
    shell = require('gulp-shell'),
    runSequence = require('run-sequence'),
    sourcePattern = 'src/client/js/**/*.js';

gulp.task('lint', function () {
    'use strict';

    gulp.src(sourcePattern)
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('jshint-stylish'));
});

function changeNotification(event) {
    'use strict';

    console.log('File', event.path, 'was', event.type, ', running tasks...');
}

function build() {
    'use strict';

    var jsWatcher = gulp.watch(sourcePattern, [/*'js',*/ 'lint']);

    jsWatcher.on('change', changeNotification);
}

gulp.task('rjs-build', shell.task(['node ./node_modules/requirejs/bin/r.js -o ./utils/build/webgme.classes/cbuild.js']));

gulp.task('register-watchers', [], function (cb) {
    gulp.watch('src/**/*.js', ['rjs-build']);
    return cb;
});

gulp.task('dev', function (cb) {
    runSequence('rjs-build', 'register-watchers', cb);
});

gulp.task('compile-all', ['rjs-build'], function () {});

gulp.task('default', [/*'js',*/ 'lint'], build);
