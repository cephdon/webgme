/*
 * Copyright (C) 2012 Vanderbilt University, All rights reserved.
 * 
 * Author: Miklos Maroti
 */

define("ifexists", {
	load: function (name, require, onload) {
		require([ name ], onload, function () {
			onload(null);
		});
	}
});

define([ "ifexists!config/local" ], function (LOCAL) {
	"use strict";

	var GLOBAL = {
		host: 'http://kecskes.isis.vanderbilt.edu',
		port: 80,
		project: "test",
		autorecconnect: true,
		reconndelay: 1000,
		reconnamount: 1000,
		autostart: false,

		//used by the server
		loglevel: 2, // 5 = ALL, 4 = DEBUG, 3 = INFO, 2 = WARNING, 1 = ERROR, 0 = OFF
		logfile: 'server.log',
		mongoip: "129.59.105.239",
		mongoport: 27017,
		mongodatabase: "multi"
	};

	if (LOCAL) {
		for ( var key in LOCAL) {
			GLOBAL[key] = LOCAL[key];
		}
	}

	return GLOBAL;
});