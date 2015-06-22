/*globals*/
/*jshint node:true, newcap:false, mocha:true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

var testFixture = require('../../_globals.js');

describe('SafeStorage', function () {
    'use strict';
    var gmeConfig = testFixture.getGmeConfig(),
        expect = testFixture.expect,
        logger = testFixture.logger.fork('memory'),
        Q = testFixture.Q,

        gmeAuth,
        projectName = 'newProject',
        guestAccount = gmeConfig.authentication.guestAccount;


    before(function (done) {
        testFixture.clearDBAndGetGMEAuth(gmeConfig, projectName)
            .then(function (gmeAuth_) {
                gmeAuth = gmeAuth_;
            })
            .nodeify(done);
    });

    after(function (done) {
        Q.all([
            gmeAuth.unload()
        ])
            .nodeify(done);
    });


    describe('Projects', function () {
        var safeStorage,
            commitHash;

        before(function (done) {
            safeStorage = testFixture.getMemoryStorage(logger, gmeConfig, gmeAuth);

            safeStorage.openDatabase()
                .then(function () {
                    return safeStorage.deleteProject({projectName: projectName});
                })
                .then(function () {
                    return testFixture.importProject(safeStorage, {
                        projectSeed: 'seeds/EmptyProject.json',
                        projectName: projectName,
                        gmeConfig: gmeConfig,
                        logger: logger
                    });
                })
                .then(function (result) {
                    commitHash = result.commitHash;
                    return Q();
                })
                .nodeify(done);
        });

        after(function (done) {
            Q.all([
                safeStorage.closeDatabase()
            ])
                .nodeify(done);
        });

        it('should getProjects', function (done) {
            var data = {};

            safeStorage.getProjects(data)
                .then(function (projects) {
                    expect(projects).to.deep.equal([{
                        delete: true,
                        name: projectName,
                        read: true,
                        write: true
                    }]);
                })
                .nodeify(done);
        });

        it('should getProjectsAndBranches', function (done) {
            var data = {};

            safeStorage.getProjectsAndBranches(data)
                .then(function (projects) {
                    expect(projects).to.have.property('length');
                    expect(projects.length).to.equal(1);
                    expect(projects[0].name).to.equal(projectName);
                    expect(projects[0].branches).to.have.property('master');
                })
                .nodeify(done);
        });

        it('should getLatestCommitData', function (done) {
            var data = {
                projectName: projectName,
                branchName: 'master'
            };

            safeStorage.getLatestCommitData(data)
                .then(function (commitData) {
                    expect(commitData).to.have.property('projectName');
                    expect(commitData).to.have.property('branchName');
                    expect(commitData).to.have.property('commitObject');
                    expect(commitData).to.have.property('coreObjects');

                    expect(commitData.projectName).to.equal(projectName);
                    expect(commitData.branchName).to.equal('master');

                    expect(commitData.commitObject).to.have.property('message');
                    expect(commitData.commitObject).to.have.property('parents');
                    expect(commitData.commitObject).to.have.property('root');
                    expect(commitData.commitObject).to.have.property('time');
                    expect(commitData.commitObject.type).to.equal('commit');
                    expect(commitData.commitObject).to.have.property('updater');
                })
                .nodeify(done);
        });

        it('should getBranchHash', function (done) {
            var data = {
                projectName: projectName,
                branchName: 'master'
            };

            safeStorage.getBranchHash(data)
                .then(function (hash) {
                    expect(hash[0]).to.equal('#');
                    expect(hash.length).to.equal(41);
                })
                .nodeify(done);
        });

        it('should setBranchHash', function (done) {
            var data = {
                projectName: projectName,
                branchName: 'master'
            };

            safeStorage.getBranchHash(data)
                .then(function (hash) {
                    expect(hash[0]).to.equal('#');
                    expect(hash.length).to.equal(41);

                    data.branchName = 'setBranchHash';
                    data.oldHash = '';
                    data.newHash = hash;

                    return safeStorage.setBranchHash(data);
                })
                .then(function (result) {
                    expect(result).to.deep.equal({status: 'SYNCH'});
                })
                .nodeify(done);
        });

        it('should createBranch', function (done) {
            var data = {
                projectName: projectName,
                branchName: 'master'
            };

            safeStorage.getBranchHash(data)
                .then(function (hash) {
                    expect(hash[0]).to.equal('#');
                    expect(hash.length).to.equal(41);

                    data.branchName = 'createBranch';
                    data.hash = hash;

                    return safeStorage.createBranch(data);
                })
                .then(function (result) {
                    expect(result).to.deep.equal({status: 'SYNCH'});
                    return safeStorage.getBranches(data);
                })
                .then(function (result) {
                    expect(result).to.have.property(data.branchName);
                })
                .nodeify(done);
        });

        it('should deleteBranch', function (done) {
            var data = {
                projectName: projectName,
                branchName: 'master'
            };

            safeStorage.getBranchHash(data)
                .then(function (hash) {
                    expect(hash[0]).to.equal('#');
                    expect(hash.length).to.equal(41);

                    data.branchName = 'deleteBranch';
                    data.hash = hash;

                    return safeStorage.createBranch(data);
                })
                .then(function (result) {
                    expect(result).to.deep.equal({status: 'SYNCH'});
                    return safeStorage.getBranches(data);
                })
                .then(function (result) {
                    expect(result).to.have.property(data.branchName);
                    return safeStorage.deleteBranch(data);
                })
                .then(function (result) {
                    expect(result).to.deep.equal({status: 'SYNCH'});
                    return safeStorage.getBranches(data);
                })
                .then(function (result) {
                    expect(result).to.not.have.property(data.branchName);
                })
                .nodeify(done);
        });

        it('should loadObjects', function (done) {
            var data = {
                    projectName: projectName,
                    branchName: 'master'
                },
                commitId,
                rootId;

            safeStorage.getLatestCommitData(data)
                .then(function (commitData) {
                    commitId = commitData.commitObject._id;
                    rootId = commitData.commitObject.root;

                    expect(commitId[0]).to.equal('#');
                    expect(rootId[0]).to.equal('#');

                    data.hashes = [commitId, rootId];

                    return safeStorage.loadObjects(data);
                })
                .then(function (objects) {
                    expect(objects[commitId].type).to.equal('commit');
                    expect(objects[rootId]._id).to.equal(rootId);
                })
                .nodeify(done);
        });
    });

    describe('getCommits', function () {
        var safeStorage,
            commitHash;

        before(function (done) {
            safeStorage = testFixture.getMemoryStorage(logger, gmeConfig, gmeAuth);

            safeStorage.openDatabase()
                .then(function () {
                    return safeStorage.deleteProject({projectName: projectName});
                })
                .then(function () {
                    return testFixture.importProject(safeStorage, {
                        projectSeed: 'seeds/EmptyProject.json',
                        projectName: projectName,
                        gmeConfig: gmeConfig,
                        logger: logger
                    });
                })
                .then(function (result) {
                    commitHash = result.commitHash;
                    return Q();
                })
                .nodeify(done);
        });

        it('should getCommits using timestamp', function (done) {
            var data = {
                projectName: projectName,
                number: 10,
                before: (new Date()).getTime() + 1
            };

            safeStorage.getCommits(data)
                .then(function (commits) {
                    expect(commits.length).equal(1);
                    expect(commits[0]._id === commitHash);
                    done();
                })
                .catch(done);
        });

        it('should getCommits using commitHash', function (done) {
            var data = {
                projectName: projectName,
                number: 10,
                before: commitHash
            };

            safeStorage.getCommits(data)
                .then(function (commits) {
                    expect(commits.length).equal(1);
                    expect(commits[0]._id === commitHash);
                    done();
                })
                .catch(done);
        });

        it('should fail getCommits using commitHash if invalid hash given', function (done) {
            var data = {
                projectName: projectName,
                number: 10,
                before: 'invalidHash'
            };

            safeStorage.getCommits(data)
                .then(function () {
                    done(new Error('should have failed with error'));
                })
                .catch(function (err) {
                    expect(err).to.not.equal(null);
                    expect(typeof err).to.equal('object');
                    expect(err.message).to.equal('Invalid argument, data.before is not a number nor a valid hash.');
                    done();
                });
        });

        it('should fail getCommits using commitHash if hash does not exist', function (done) {
            var dummyHash = '#12312312312313123',
                data = {
                    projectName: projectName,
                    number: 10,
                    before: dummyHash
                };

            safeStorage.getCommits(data)
                .then(function () {
                    done(new Error('should have failed with error'));
                })
                .catch(function (err) {
                    expect(err).to.not.equal(null);
                    expect(typeof err).to.equal('object');
                    expect(err.message).to.equal('object does not exist ' + dummyHash);
                    done();
                });
        });
    });
});