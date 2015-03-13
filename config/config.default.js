/*jshint node: true*/
/**
 * @author lattmann / https://github.com/lattmann
 * @author pmeijer / https://github.com/pmeijer
 */

var path = require('path'),
    config = {
    debug: false,

    server: {
        port: 8888,
        maxWorkers: 10,
        sessionCookieId: 'webgmeSid',
        sessionCookieSecret: 'meWebGMEez',
        https: {
            enable: false,
            certificateFile: path.join(__dirname, '../certificates/sample-cert.pem'),
            keyFile: path.join(__dirname, '../certificates/sample-key.pem')
        }
    },

    client: {
        appDir: path.join(__dirname, '../src/client'),
        // Used in client/WebGME.js to load initial project.
        defaultProject: {
            name: null,
            branch: null,
            node: null
        }
    },

    mongo: {
        uri: 'mongodb://127.0.0.1:27017/multi',
        options: {
            w: 1,
            'native-parser': true,
            auto_reconnect: true,
            poolSize: 20,
            socketOptions: {keepAlive: 1}
        }
    },

    socketIO: {
        reconnect: false,
        'connect timeout': 10,
        'reconnection delay': 1,
        'force new connection': true,
        transports: ['websocket']
    },

    log: {
        level: 1, // 5 = ALL, 4 = DEBUG, 3 = INFO, 2 = WARNING, 1 = ERROR, 0 = OFF
        file: 'server.log'
    },

    authentication: {
        enable: false,
        salts: 10,
        allowGuests: false,
        logOutUrl: '/',
        guestAccount: 'anonymous'
    },

    blob: {
        type: 'FS', //'FS', 'S3'
        fsDir: './blob-local-storage',
        s3: {}
    },

    executor: {
        enable: false,
        outputDir: './',
        nonce: null,
        workerRefreshInterval: 5000
    },

    plugin: {
        allowServerExecution: false,
        basePaths: [path.join(__dirname, '../src/plugin/coreplugins')]
    },

    rest: {
        secure: false,
        components: {}
    },

    addOn: {
        enable: true,
        basePaths: [path.join(__dirname, '../src/addon/core')]
    },

    visualization: {
        decoratorPaths: [path.join(__dirname, '../src/client/decorators')],
        visualizerDescriptors: [path.join(__dirname, '../src/client/js/Visualizers.json')]
    },

    storage: {
        autoPersist: true, // core setting
        cache: 2000,
        clientCacheSize: 2000, // overwrites cache on client
        keyType: 'plainSHA1', // 'rand160Bits', 'ZSSHA', 'plainSHA1',
        timeout: 10000,
        failSafe: 'memory',
        failSafeFrequency: 10000
    },

    requirejsPaths: {}
};

module.exports = config;
