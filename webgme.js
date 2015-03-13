/*jshint node:true*/
/**
 * @author kecso / https://github.com/kecso
 * @author nabana / https://github.com/nabana
 */

//This is the only module which doesn't check for requirejs, and this is the only which defines the baseUrl
var requirejs = require('requirejs'),
    path = require('path'),
    requireJsBase = path.join(__dirname, 'src'),
    fs = require('fs');

requirejs.config({
    nodeRequire: require,
    baseUrl: requireJsBase,
    paths: {
        "logManager": "common/LogManager",
        "storage": "common/storage",
        "core": "common/core",
        "server": "server",
        "auth": "server/auth",
        "util": "common/util",
        "baseConfig": "bin/getconfig",
        "webgme": "webgme",
        "plugin": "plugin",
        "worker": "server/worker",
        "coreclient": "common/core/users",
        "blob": "middleware/blob",
        "executor": "middleware/executor",
    }
});

function addToRequireJsPaths(gmeConfig) {
    'use strict';

    var isGoodExtraAsset = function (name, filePath) {
            try {
                var file = fs.readFileSync(filePath + '/' + name + '.js', 'utf-8');
                if (file === undefined || file === null) {
                    return false;
                } else {
                    return true;
                }
            } catch (e) {
                return false;
            }
        },
        getComponentNames = function (basePaths) {
            var names = []; //we add only the "*.js" files from the directories
            basePaths = basePaths || [];
            for (var i = 0; i < basePaths.length; i++) {
                var additional = fs.readdirSync(basePaths[i]);
                for (var j = 0; j < additional.length; j++) {
                    if (names.indexOf(additional[j]) === -1) {
                        if (isGoodExtraAsset(additional[j], path.join(basePaths[i], additional[j]))) {
                            names.push(additional[j]);
                        }
                    }
                }
            }
            return names;
        },
        addFromBasePath = function (basepaths, componentName) {
            //type = 'plugin'
            var componentNames = getComponentNames(basepaths),
                i, j;

            //we go through every plugin and we check where we are able to find the main part of it so we can set the plugin/pluginName path according that in requirejs
            var componentPaths = {};
            for (i in componentNames) {
                var found = false;
                for (j = 0; j < basepaths.length; j++) {
                    if (!found) {
                        try {
                            var items = fs.readdirSync(basepaths[j]);
                            if (items.indexOf(componentNames[i]) !== -1) {
                                componentPaths[componentName + '/' + componentNames[i]] = path.relative(requireJsBase,
                                    path.resolve(basepaths[j]));
                                found = true;
                            }
                        } catch (e) {
                            //do nothing as we will go on anyway
                            //console.error(e);
                        }
                    } else {
                        break;
                    }
                }
            }

            requirejs.config({
                paths: componentPaths
            });
        },
        addFromRequireJsPath = function (requireJsPaths) {
            var configPaths = {},
                keys = Object.keys(requireJsPaths);

            for (var i = 0; i < keys.length; i += 1) {
                configPaths[keys[i]] = path.relative(requireJsBase, path.resolve(requireJsPaths[keys[i]]));
            }

            requirejs.config({
                paths: configPaths
            });
        };

    addFromBasePath(gmeConfig.plugin.basePaths, 'plugin');
    addFromBasePath(gmeConfig.addOn.basePaths, 'addon');
    addFromRequireJsPath(gmeConfig.requirejsPaths);
    //console.error(JSON.stringify(requirejs.s.contexts._.config, null, 4)); // TODO remove me
}

// FIXME: classes must start with uppercase, instances must start with lowercase
module.exports = {
    addToRequireJsPaths: addToRequireJsPaths,
    clientStorage: requirejs('storage/clientstorage'),
    serverStorage: requirejs('storage/serverstorage'),
    serverUserStorage: requirejs('storage/serveruserstorage'),
    core: requirejs('core/core'),
    standaloneServer: requirejs('server/standalone'),
    logManager: requirejs('logManager'),
    runPlugin: requirejs('server/runplugin'),
    serializer: requirejs('core/users/serialization'),
    canon: requirejs('common/util/canon'),
    requirejs: requirejs
};