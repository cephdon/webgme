/*globals define*/
/*
 * Copyright (C) 2013 Vanderbilt University, All rights reserved.
 *
 * @author brollb / https://github/brollb
 */

define(['logManager',
       'util/assert',
       './AutoRouter.Constants',
       './AutoRouter.Utils',
       './AutoRouter.Path',
       './AutoRouter.Port',
       './AutoRouter.Box',
       './AutoRouter.Edge'], function (logManager, 
                                       assert,
                                       CONSTANTS,
                                       Utils,
                                       AutoRouterPath,
                                       AutoRouterPort,
                                       AutoRouterBox,
                                       AutoRouterEdge) {

    "use strict"; 

    //----------------------AutoRouterEdgeList

    var AutoRouterEdgeList = function (b) {
        this.owner = null;

        //--Edges
        this.ishorizontal = b;

        //--Order
        this.orderFirst = null;
        this.orderLast = null;

        //--Section
        this.section_first = null;
        this.section_blocker = null;
        this.section_ptr2blocked = []; // This is an array to emulate the pointer to a pointer functionality in CPP. 
                                       // That is, this.section_ptr2blocked[0] = this.section_ptr2blocked*

        this._initOrder();
        this._initSection();
    };

    // Public Functions
    AutoRouterEdgeList.prototype.contains = function(start, end) {
        var currentEdge = this.orderFirst,
            startpoint,
            endpoint;

        while (currentEdge) {
            startpoint = currentEdge.startpoint;
            endpoint = currentEdge.endpoint;
            if (start.equals(startpoint) && end.equals(endpoint)) {
               return true;
            }
            currentEdge = currentEdge.orderNext;
        }

        return false;
    };

    AutoRouterEdgeList.prototype.destroy = function() {
        this.checkOrder();
        this.checkSection();
    };

    AutoRouterEdgeList.prototype.addPathEdges = function(path) {
        assert(path.owner === this.owner,
               'AREdgeList.addEdges: path.owner === owner FAILED!');

        var isPathAutoRouted = path.isAutoRouted(),
            hasCustomEdge = false,
            customizedIndexes = {},
            indexes = [],
            startpoint,
            endpoint,
            dir,
            edge,
            i;

        //path.getCustomizedEdgeIndexes(indexes);

        if (isPathAutoRouted) {
            i = -1;
            while(++i < indexes.length) {
                hasCustomEdge = true;
                customizedIndexes[indexes[i]] = 0;
            }
        }else {
            hasCustomEdge = true;
        }

        var pointList = path.getPointList(),
            ptrsObject = pointList.getTailEdgePtrs(),
            indItr,
            currEdgeIndex = pointList.length - 2,
            goodAngle,
            pos = ptrsObject.pos,
            skipEdge,
            isMoveable,
            isEdgeCustomFixed,
            startPort,
            endPort,
            isStartPortConnectToCenter,
            isEndPortConnectToCenter,
            isPathFixed;

        startpoint = ptrsObject.start;
        endpoint = ptrsObject.end;

        while (pointList.length && pos >= 0) {

            dir = Utils.getDir(endpoint.minus(startpoint));

            skipEdge = dir === CONSTANTS.Dir_None ? true : false;
            isMoveable = path.isMoveable();

            if (!isMoveable && dir !== CONSTANTS.Dir_Skew) {
                goodAngle = Utils.isRightAngle(dir);
                assert(goodAngle,
                    'AREdgeList.addEdges: Utils.isRightAngle (dir) FAILED!');

                    if (!goodAngle) {
                        skipEdge = true;
                    }

            }

            if (!skipEdge && 
                (Utils.isRightAngle (dir) && Utils.isHorizontal (dir) === this.ishorizontal)) {
                    edge = new AutoRouterEdge();
                    edge.owner = path;

                    edge.setStartAndEndPoint(startpoint, endpoint);
                    edge.startpointPrev = pointList.getPointBeforeEdge(pos);
                    edge.endpointNext = pointList.getPointAfterEdge(pos);

                    if (hasCustomEdge) {
                        isEdgeCustomFixed = false;
                        if (isPathAutoRouted) {
                            indItr = customizedIndexes.indexOf(currEdgeIndex);
                            isEdgeCustomFixed = (indItr !== customizedIndexes.length - 1);
                        } else {
                            isEdgeCustomFixed = true;
                        }

                        edge.setEdgeCustomFixed(isEdgeCustomFixed);

                    } else {

                        edge.setEdgeCustomFixed(dir === CONSTANTS.Dir_Skew);
                    }

                    startPort = path.getStartPort();

                    assert(startPort !== null,
                    'AREdgeList.addEdges: startPort !== null FAILED!');

                    isStartPortConnectToCenter = startPort.isConnectToCenter();
                    endPort = path.getEndPort();

                    assert(endPort !== null,
                    'AREdgeList.addEdges: endPort !== null FAILED!');

                    isEndPortConnectToCenter = endPort.isConnectToCenter();
                    isPathFixed = path.isFixed();

                    edge.setEdgeFixed(edge.getEdgeCustomFixed() || isPathFixed ||
                    (edge.isStartPointPrevNull() && isStartPortConnectToCenter) ||
                    (edge.isEndPointNextNull() && isEndPortConnectToCenter));

                    if (dir !== CONSTANTS.Dir_Skew) {
                        this._position_LoadY(edge);
                        this._position_LoadB(edge);
                    } else {
                        edge.positionY = 0;
                        edge.bracketOpening = false;
                        edge.bracketClosing = false;
                    }

                    this.insert(edge);

                }

                ptrsObject = pointList.getPrevEdgePtrs(pos);
                pos = ptrsObject.pos;
                startpoint = ptrsObject.start;
                endpoint = ptrsObject.end;
                currEdgeIndex--;
        }

        return true;
    };

    AutoRouterEdgeList.prototype.addPortEdges = function(port) {
        var startpoint,
            endpoint,
            edge,
            selfPoints,
            startpoint_prev,
            endpoint_next,
            dir,
            i,
            canHaveStartEndPointHorizontal;

        assert(port.owner.owner === this.owner,
            'AREdgeList.addEdges: port.owner === (owner) FAILED!');

        if (port.isConnectToCenter() || port.owner.isAtomic()) {
            return;
        }

        selfPoints = port.selfPoints;

        for(i = 0; i < 4; i++) {

            startpoint_prev = selfPoints[(i + 3) % 4];
            startpoint = selfPoints[i];
            endpoint = selfPoints[(i + 1) % 4];
            endpoint_next = selfPoints[(i + 2) % 4];
            dir = Utils.getDir(endpoint.minus(startpoint));

            assert(Utils.isRightAngle(dir),
                'AREdgeList.addEdges: Utils.isRightAngle (dir) FAILED!');

            canHaveStartEndPointHorizontal = port.canHaveStartEndPointHorizontal(this.ishorizontal);
            if (Utils.isHorizontal(dir) === this.ishorizontal && canHaveStartEndPointHorizontal) {
                edge = new AutoRouterEdge();

                edge.owner = port;
                edge.setStartAndEndPoint(startpoint, endpoint);
                edge.startpointPrev = startpoint_prev;
                edge.endpointNext = endpoint_next;

                edge.setEdgeFixed(true);

                this._position_LoadY(edge);
                this._position_LoadB(edge);

                if (edge.bracketClosing) {
                    edge.addToPosition(0.999); 
                }

                this.insert(edge);
            }
        }
    };

    AutoRouterEdgeList.prototype.addEdges = function(path) {
        var selfPoints,
            startpoint,
            startpoint_prev,
            endpoint_next,
            endpoint,
            edge,
            dir,
            i;

        if (path instanceof AutoRouterBox) {
            var box = path;

            assert(box.owner === this.owner,
                   'AREdgeList.addEdges: box.owner === (owner) FAILED!');


            selfPoints = box.selfPoints;

            for(i = 0; i < 4; i++) {
                startpoint_prev = selfPoints[(i + 3) % 4];
                startpoint = selfPoints[i];
                endpoint = selfPoints[(i + 1) % 4];
                endpoint_next = selfPoints[(i + 2) % 4];
                dir = Utils.getDir (endpoint.minus(startpoint));

                assert(Utils.isRightAngle (dir),
                       'AREdgeList.addEdges: Utils.isRightAngle (dir) FAILED!');

                if (Utils.isHorizontal (dir) === this.ishorizontal) {
                    edge = new AutoRouterEdge();

                    edge.owner = box;
                    edge.setStartAndEndPoint(startpoint, endpoint);
                    edge.startpointPrev = startpoint_prev;
                    edge.endpointNext = endpoint_next;

                    edge.setEdgeFixed(true);

                    this._position_LoadY(edge);
                    this._position_LoadB(edge);

                    if (edge.bracketClosing) {
                        edge.addToPosition(0.999); 
                    }

                    this.insert(edge);
                }
            }
        } else if (path) {  // path is an ARGraph
            var graph = path;
            assert(graph === this.owner,
                   'AREdgeList.addEdges: graph === this.owner FAILED!');

            selfPoints = graph.selfPoints;

            for(i = 0; i < 4; i++) {

                startpoint_prev = selfPoints[(i + 3) % 4];
                startpoint = selfPoints[i];
                endpoint = selfPoints[(i + 1) % 4];
                endpoint_next = selfPoints[(i + 2) % 4];
                dir = Utils.getDir(endpoint.minus(startpoint));

                assert(Utils.isRightAngle (dir),
                       'AREdgeList.addEdges: Utils.isRightAngle (dir) FAILED!');

                if (Utils.isHorizontal (dir) === this.ishorizontal) {
                    edge = new AutoRouterEdge();

                    edge.owner = graph;
                    edge.setStartAndEndPoint(startpoint, endpoint);
                    edge.startpointPrev = startpoint_prev;
                    edge.endpointNext = endpoint_next;

                    edge.setEdgeFixed(true);

                    this._position_LoadY(edge);
                    this.insert(edge);
                }
            }

        }
    };

    AutoRouterEdgeList.prototype.deleteEdges = function (object) {
        var edge = this.orderFirst,
            next;

        while( edge !== null) {
            if (edge.owner === object) {
                next = edge.orderNext;
                this.remove(edge);
                edge = next;
            } else {
                edge = edge.orderNext;
            }
        }

    };

    AutoRouterEdgeList.prototype.deleteAllEdges = function() {
        while(this.orderFirst) {
            this.remove(this.orderFirst);
        }
    };

    AutoRouterEdgeList.prototype.isEmpty = function() {
        return this.orderFirst === null;
    }; 

    AutoRouterEdgeList.prototype.getEdge = function(path, startpoint, endpoint) {
        var edge = this.orderFirst;
        while(edge !== null) {

            if ( edge.isSameStartPoint(startpoint)) {
                break;
            }

            edge = edge.orderNext;
        }

        assert(edge !== null,
               'AREdgeList.getEdge: edge !== null FAILED!');
        return edge;
    };

    AutoRouterEdgeList.prototype.getEdgeByPointer = function(startpoint) {
        var edge = this.orderFirst;
        while(edge !== null) {
            if (edge.isSameStartPoint(startpoint)) {
                break;
            }

            edge = edge.orderNext;
        }

        assert(edge !== null,
               'AREdgeList.getEdgeByPointer: edge !== null FAILED!');
        return edge;
    };

    AutoRouterEdgeList.prototype.setEdgeByPointer = function(pEdge, newEdge) {
        assert(newEdge instanceof AutoRouterEdge,
               'AREdgeList.setEdgeByPointer: newEdge instanceof AutoRouterEdge FAILED!');
        var edge = this.section_first;
        while(edge !== null) {
            if (pEdge === edge) {
                break;
            }

            edge = edge.getSectionDown();
        }

        assert(edge !== null,
               'AREdgeList.setEdgeByPointer: edge !== null FAILED!');
        edge = newEdge;
    };

    AutoRouterEdgeList.prototype.getEdgeAt = function(point, nearness) {
        var edge = this.orderFirst;
        while(edge) {

            if (Utils.isPointNearLine(point, edge.startpoint, edge.endpoint, nearness)) {
                return edge;
            }

            edge = edge.orderNext;
        }

        return null;
    };        

    AutoRouterEdgeList.prototype.dumpEdges = function(msg) {
        var edge = this.orderFirst,
            total = 1;
        console.log(msg);

        while(edge !== null) {
            console.log('\t' + edge.startpoint.x + ', ' + edge.startpoint.y + '\t\t' + edge.endpoint.x + ', ' + edge.endpoint.y + '\t\t\t(' + (edge.getEdgeFixed() ? "FIXED" : "MOVEABLE" ) + ')\t\t' + (edge.bracketClosing ? "Bracket Closing" : (edge.bracketOpening ? "Bracket Opening" : "")));
            edge = edge.orderNext;
            total++;
        }

        console.log("Total Edges: " + total);
    };

    AutoRouterEdgeList.prototype.getEdgeCount = function() {
        var edge = this.orderFirst,
            total = 1;
        while(edge !== null) {
            edge = edge.orderNext;
            total++;
        }
        return total;
    };

    //--Private Functions
    AutoRouterEdgeList.prototype._position_GetRealY = function (edge, y) {
        if (y === undefined) {
            if (this.ishorizontal) {
                assert(edge.startpoint.y === edge.endpoint.y,
                       'AREdgeList.position_GetRealY: edge.startpoint.y === edge.endpoint.y FAILED!');
                return edge.startpoint.y;
            }

            assert(edge.startpoint.x === edge.endpoint.x,
                   'AREdgeList.position_GetRealY: edge.startpoint.x === edge.endpoint.x FAILED!');
            return edge.startpoint.x;
        } else {

            assert(edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull(),
                   'AREdgeList.position_GetRealY: edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull() FAILED!');

            if ( this.ishorizontal) {
                assert(edge.startpoint.y === edge.endpoint.y,
                       'AREdgeList.position_GetRealY: edge.startpoint.y === edge.endpoint.y FAILED!');
                edge.setStartPointY(y);
                edge.setEndPointY(y);
            } else {
                assert(edge.startpoint.x === edge.endpoint.x,
                       'AREdgeList.position_GetRealY: edge.startpoint.x === edge.endpoint.x FAILED');

                edge.setStartPointX(y);
                edge.setEndPointX(y);
            }
        }
    };

    AutoRouterEdgeList.prototype._position_SetRealY = function (edge, y) {
        if (edge instanceof Array) { 
            edge = edge[0];
        }

        assert(edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull(),
               'AREdgeList.position_SetRealY: edge != null && !edge.isStartPointNull() && !edge.isEndPointNull() FAILED');

        if (this.ishorizontal) {
            assert(edge.startpoint.y === edge.endpoint.y,
                   'AREdgeList.position_SetRealY: edge.startpoint.y === edge.endpoint.y FAILED');
            edge.setStartPointY(y);
            edge.setEndPointY(y);
        } else {
            assert(edge.startpoint.x === edge.endpoint.x,
                   'AREdgeList.position_SetRealY: edge.startpoint.x === edge.endpoint.x FAILED');
            edge.setStartPointX(y);
            edge.setEndPointX(y);
        }
    };

    /**
     * Normalize the edge endpoints so x1 < x2
     */
    AutoRouterEdgeList.prototype._position_GetRealX = function (edge) {
        assert(edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull(),"AREdgeList.position_GetRealX: edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull() FAILED");
        var x1, x2;

        if (this.ishorizontal) {
            assert(edge.startpoint.y === edge.endpoint.y,
                   'AREdgeList.position_GetRealX: edge.startpoint.y === edge.endpoint.y FAILED');

            if (edge.startpoint.x < edge.endpoint.x) {

                x1 = edge.startpoint.x;
                x2 = edge.endpoint.x;
            } else {

                x1 = edge.endpoint.x;
                x2 = edge.startpoint.x;
            }
        } else {
            assert(edge.startpoint.x === edge.endpoint.x,
                   'AREdgeList.position_GetRealX: edge.startpoint.x === edge.endpoint.x FAILED');
            if (edge.startpoint.y < edge.endpoint.y) {

                x1 = edge.startpoint.y;
                x2 = edge.endpoint.y;
            } else {

                x1 = edge.endpoint.y;
                x2 = edge.startpoint.y;
            }
        }

        return [x1, x2];
    };

    AutoRouterEdgeList.prototype._position_GetRealO = function (edge) {
        assert(edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull(),
               'AREdgeList.position_GetRealO: edge !== null && !edge.isStartPointNull() && !edge.isEndPointNull() FAILED');
        var o1, o2;

        if (this.ishorizontal) {
            assert(edge.startpoint.y === edge.endpoint.y,
                   'AREdgeList.position_GetRealO: edge.startpoint.y === edge.endpoint.y FAILED');
            if (edge.startpoint.x < edge.endpoint.x) {

                o1 = edge.isStartPointPrevNull() ? 0 : edge.startpointPrev.y - edge.startpoint.y;
                o2 = edge.isEndPointNextNull() ? 0 : edge.endpointNext.y - edge.endpoint.y;
            } else {

                o1 = edge.isEndPointNextNull() ? 0 : edge.endpointNext.y - edge.endpoint.y;
                o2 = edge.isStartPointPrevNull() ? 0 : edge.startpointPrev.y - edge.startpoint.y;
            }
        }
        else{
            assert(edge.startpoint.x === edge.endpoint.x ,
                   'AREdgeList.position_GetRealO: edge.startpoint.x === edge.endpoint.x FAILED');
            if (edge.startpoint.y < edge.endpoint.y) {

                o1 = edge.isStartPointPrevNull() ? 0 : edge.startpointPrev.x - edge.startpoint.x;
                o2 = edge.isEndPointNextNull() ? 0 : edge.endpointNext.x - edge.endpoint.x;
            } else {

                o1 = edge.isEndPointNextNull() ? 0 : edge.endpointNext.x - edge.endpoint.x;
                o2 = edge.isStartPointPrevNull() ? 0 : edge.startpointPrev.x - edge.startpoint.x;
            }
        }

        return [o1, o2];
    };

    AutoRouterEdgeList.prototype._position_LoadY = function (edge) {
        assert(edge !== null && edge.orderNext === null && edge.orderPrev === null,
               'AREdgeList.position_LoadY: edge !== null && edge.orderNext === null && edge.orderPrev === null FAILED');

        edge.positionY =  this._position_GetRealY(edge);
    };

    AutoRouterEdgeList.prototype._position_LoadB = function (edge) {
        assert(edge !== null,
               'AREdgeList.position_LoadB: edge !== null FAILED');

        edge.bracketOpening = !edge.getEdgeFixed() && this.bracket_IsOpening(edge);
        edge.bracketClosing = !edge.getEdgeFixed() && this.bracket_IsClosing(edge);
    };

    AutoRouterEdgeList.prototype._positionAll_StoreY = function () {
        var edge = this.orderFirst;
        while(edge) {
            this._position_SetRealY(edge, edge.positionY);
            edge = edge.orderNext;
        }

    };

    AutoRouterEdgeList.prototype._positionAll_LoadX = function () {
        var edge = this.orderFirst,
            pts;
        while(edge) {
            pts = this._position_GetRealX(edge);
            edge.positionX1 = pts[0];
            edge.positionX2 = pts[1];

            edge = edge.orderNext;
        }
    };

    AutoRouterEdgeList.prototype._initOrder = function () {
        this.orderFirst = null;
        this.orderLast = null;
    };

    AutoRouterEdgeList.prototype._checkOrder = function () {
        assert(this.orderFirst === null && this.orderLast === null,
               'AREdgeList.checkOrder: this.orderFirst === null && this.orderLast === null FAILED');
    };

    //---Order

    AutoRouterEdgeList.prototype.insertBefore = function(edge, before) {
        assert(edge !== null && before !== null && edge !== before,
               'AREdgeList.insertBefore: edge !== null && before !== null && edge !== before FAILED');
               assert(edge.orderNext === null && edge.orderPrev === null,
                      'AREdgeList.insertBefore: edge.orderNext === null && edge.orderPrev === null FAILED');

        edge.orderPrev = before.orderPrev;
        edge.orderNext = before;

        if (before.orderPrev) {
            assert(before.orderPrev.orderNext === before, "AREdgeList.insertBefore: before.orderPrev.orderNext === before FAILED\nbefore.orderPrev.orderNext is " + before.orderPrev.orderNext + " and before is " + before);
            before.orderPrev.orderNext = edge;

            assert(this.orderFirst !== before,
                   'AREdgeList.insertBefore: this.orderFirst !== before FAILED');
        } else {

            assert(this.orderFirst === before,
                   'AREdgeList.insertBefore: this.orderFirst === before FAILED');
            this.orderFirst = edge;
        }

        before.orderPrev = edge;
    };

    AutoRouterEdgeList.prototype.insertAfter = function(edge, after) {
        assert(edge !== null && after !== null && !edge.equals(after),
               'AREdgeList.insertAfter:  edge !== null && after !== null && !edge.equals(after) FAILED'); 
               assert(edge.orderNext === null && edge.orderPrev === null,
                      'AREdgeList.insertAfter: edge.orderNext === null && edge.orderPrev === null FAILED ');

        edge.orderNext = after.orderNext;
        edge.orderPrev = after;

        if (after.orderNext) {
            assert(after.orderNext.orderPrev.equals(after),
                   'AREdgeList.insertAfter:  after.orderNext.orderPrev.equals(after) FAILED');
            after.orderNext.orderPrev = edge;

            assert(!this.orderLast.equals(after), "AREdgeList.insertAfter: !orderLast.equals(after) FAILED");
        }
        else
        {
            assert(this.orderLast.equals(after), "AREdgeList.insertAfter: this.orderLast.equals(after) FAILED");
            this.orderLast = edge;
        }

        after.orderNext = edge;
    };

    AutoRouterEdgeList.prototype.insertLast = function(edge) {
        assert(edge !== null, 
            'AREdgeList.insertLast: edge !== null FAILED');
        assert(edge.orderPrev === null && edge.orderNext === null,
            'AREdgeList.insertLast: edge.orderPrev === null && edge.orderNext === null FAILED');

        edge.orderPrev = this.orderLast;

        if (this.orderLast) {
            assert(this.orderLast.orderNext === null,
                'AREdgeList.insertLast: this.orderLast.orderNext === null FAILED');
            assert(this.orderFirst !== null, 
                'AREdgeList.insertLast: this.orderFirst != null FAILED');

            this.orderLast.orderNext = edge;
            this.orderLast = edge;
        } else {
            assert(this.orderFirst === null,
                'AREdgeList.insertLast:  this.orderFirst === null FAILED');

            this.orderFirst = edge;
            this.orderLast = edge;
        }
    };

    AutoRouterEdgeList.prototype.insert = function(edge) {
        assert(edge !== null,
            'AREdgeList.insert:  edge !== null FAILED');
        assert(edge.orderPrev === null && edge.orderNext === null, 
            'AREdgeList.insert: edge.orderPrev === null && edge.orderNext === null FAILED');

        var y = edge.positionY;

        assert(CONSTANTS.ED_MINCOORD <= y && y <= CONSTANTS.ED_MAXCOORD,
            'AREdgeList.insert: CONSTANTS.ED_MINCOORD <= y && y <= CONSTANTS.ED_MAXCOORD FAILED (y is ' + y + ')');

        var insert = this.orderFirst;

        while (insert && insert.positionY < y) {
            insert = insert.orderNext;
        }

        if (insert) {
            this.insertBefore(edge, insert);
        } else {
            this.insertLast(edge);
        }
    };

    AutoRouterEdgeList.prototype.remove = function(edge) {
        assert(edge !== null,
               'AREdgeList.remove:  edge !== null FAILED');

        if (this.orderFirst === edge) {
            this.orderFirst = edge.orderNext;
        }

        if (edge.orderNext) {
            edge.orderNext.orderPrev = edge.orderPrev;
        }

        if (this.orderLast === edge) {
            this.orderLast = edge.orderPrev;
        }

        if (edge.orderPrev) {
            edge.orderPrev.orderNext = edge.orderNext;
        }

        edge.orderNext = null;
        edge.orderPrev = null;
    };

    //-- Private

    AutoRouterEdgeList.prototype._slideButNotPassEdges = function (edge, y) {
        assert(edge !== null, "AREdgeList.slideButNotPassEdges: edge != null FAILED");
        assert(CONSTANTS.ED_MINCOORD < y && y < CONSTANTS.ED_MAXCOORD,  "AREdgeList.slideButNotPassEdges: CONSTANTS.ED_MINCOORD < y && y < CONSTANTS.ED_MAXCOORD FAILED");

        var oldy = edge.positionY;
        assert(CONSTANTS.ED_MINCOORD < oldy && oldy < CONSTANTS.ED_MAXCOORD,
               'AREdgeList.slideButNotPassEdges: CONSTANTS.ED_MINCOORD < oldy && oldy < CONSTANTS.ED_MAXCOORD FAILED');

        if (oldy === y) {
            return null;
        }

        var x1 = edge.positionX1,
            x2 = edge.positionX2,
            ret = null,
            insert = edge;

        //If we are trying to slide down

        if (oldy < y) {
            while(insert.orderNext) {
                insert = insert.orderNext;

                if (y < insert.positionY) {
                    //Then we won't be shifting past the new edge (insert)
                    break;
                }

                //If you can't pass the edge (but want to) and the lines will overlap x values...
                if (!insert.getEdgeCanpassed() && Utils.intersect (x1, x2, insert.positionX1, insert.positionX2 )) {
                    ret = insert;
                    y = insert.positionY;
                    break;
                }
            }

            if (edge !== insert && insert.orderPrev !== edge) {
                this.remove(edge); 
                this.insertBefore(edge, insert);
            }

        } else { // If we are trying to slide up
            while (insert.orderPrev) {
                insert = insert.orderPrev;

                if (y > insert.positionY) {
                    break;
                }

                //If insert cannot be passed and it is in the way of the edge (if the edge were to slide up).
                if (!insert.getEdgeCanpassed() && Utils.intersect(x1, x2, insert.positionX1, insert.positionX2)) {
                    ret = insert;
                    y = insert.positionY;
                    break;
                }
            }

            if (edge !== insert && insert.orderNext !== edge) {
                this.remove(edge);//This is where I believe the error could lie!
                this.insertAfter(edge, insert);
            }

        }

        edge.positionY = y;

        return ret;
    };

    //------Section

    // private

    AutoRouterEdgeList.prototype._initSection = function () {
        this.section_first = null;
        this.section_blocker = null;
        this.section_ptr2blocked = null;
    };

    AutoRouterEdgeList.prototype.checkSection = function () {
        if (!(this.section_blocker === null && this.section_ptr2blocked === null)) {
            // This used to be contained in an assert. Generally this fails when the router does not have a clean exit then is asked to reroute.
            this._logger.warning("section_blocker and this.section_ptr2blocked are not null. Assuming last run did not exit cleanly. Fixing...");
            this.section_blocker = null;
            this.section_ptr2blocked = null;
        }
    };

    AutoRouterEdgeList.prototype.sectionReset = function () {
        this.checkSection();

        this.section_first = null;
    };

    /**
     * Initialize the section data structure.
     *
     * @param blocker
     * @return {undefined}
     */
    AutoRouterEdgeList.prototype.section_BeginScan = function (blocker) {
        this.checkSection();

        this.section_blocker = blocker;

        this.section_blocker.sectionX1 = this.section_blocker.positionX1;
        this.section_blocker.sectionX2 = this.section_blocker.positionX2;

        this.section_blocker.setSectionNext(null);
        this.section_blocker.setSectionDown(null);
    };

    AutoRouterEdgeList.prototype.section_IsImmediate  = function () {
        assert(this.section_blocker !== null && this.section_ptr2blocked !== null && this.section_ptr2blocked !== null,
               'AREdgeList.section_IsImmediate: this.section_blocker != null && this.section_ptr2blocked != null && *section_ptr2blocked != null FAILED');

        var section_blocked = this.section_ptr2blocked[0],
            e = section_blocked.getSectionDown(),
            a1 = section_blocked.sectionX1,
            a2 = section_blocked.sectionX2,
            p1 = section_blocked.positionX1,
            p2 = section_blocked.positionX2,
            b1 = this.section_blocker.sectionX1,
            b2 = this.section_blocker.sectionX2;

        if (e !== null) {
            e = (e.startpoint === null || e.sectionX1 === undefined ? null : e);
        }

        assert(b1 <= a2 && a1 <= b2,
               'AREdgeList.section_IsImmediate: b1 <= a2 && a1 <= b2 FAILED');// not case 1 or 6

        // NOTE WE CHANGED THE CONDITIONS (A1<=B1 AND B2<=A2)
        // BECAUSE HERE WE NEED THIS!

        if (a1 <= b1) {
            while(!(e === null || e.startpoint === null) && e.sectionX2 < b1) {
                e = e.getSectionNext();
            }

            if (b2 <= a2) {
                return (e === null || e.startpoint === null)|| b2 < e.sectionX1;				// case 3
            }

            return (e === null || e.startpoint === null) && a2 === p2;								// case 2
        }

        if (b2 <= a2) {
            return a1 === p1 && ((e === null || e.startpoint === null) || b2 < e.sectionX1);	// case 5
        }

        return (e === null || e.startpoint === null) && a1 === p1 && a2 === p2;						// case 4
    };


    // The following methods are convenience methods for adjusting the "section" 
    // of an edge.
    var getLargerEndpoint = function(min, max) {
        return Math.min(min+1, (min+max)/2);
    };

    var getSmallerEndpoint = function(min, max) {
        return Math.max(max-1, (min+max)/2);
    };

    AutoRouterEdgeList.prototype.section_HasBlockedEdge = function () {
        assert(this.section_blocker !== null,
               'AREdgeList.section_HasBlockedEdge: this.section_blocker != null FAILED');

        var a1,
            a2,
            e,
            blockerX1 = this.section_blocker.sectionX1,
            blockerX2 = this.section_blocker.sectionX2;

        assert(blockerX1 <= blockerX2,
               'AREdgeList.section_HasBlockedEdge: blockerX1 <= blockerX2 FAILED');

        // Setting this.section_ptr2blocked
        if (this.section_ptr2blocked === null) {  // initialize section_ptr2blocked

            this.section_first = this.section_first === null ? [new AutoRouterEdge()] : this.section_first;
            this.section_ptr2blocked = this.section_first;
        } else {   // get next section_ptr2blocked
            var current_edge = this.section_ptr2blocked[0];

            assert(current_edge.startpoint !== null, 
                   "AREdgeList.section_HasBlockedEdge: current_edge.startpoint === null");

            var o = null;

            e = current_edge.getSectionDownPtr()[0];
            a1 = current_edge.sectionX1;  // 555.9995
            a2 = current_edge.sectionX2;  // 555.0015

            assert(a1 <= a2,
                   'AREdgeList.section_HasBlockedEdge: a1 <= a2 FAILED (' + a1 + ' <= ' + a2 + ')'+
                   '\nedge is ');

           assert(blockerX1 <= a2 &&  a1 <= blockerX2,
                  'AREdgeList.section_HasBlockedEdge: blockerX1 <= a2 &&  a1 <= blockerX2 FAILED');
            // not case 1 or 6
            if (a1 < blockerX1 && blockerX2 < a2)	{								// case 3
                this.section_ptr2blocked = current_edge.getSectionDownPtr();

            } else if (blockerX1 <= a1 && a2 <= blockerX2) {								// case 4

                if (e && e.startpoint !== null) {
                    while( e.getSectionNext() && e.getSectionNext().startpoint !== null) {
                        e = e.getSectionNext();
                    }

                    e.setSectionNext(current_edge.getSectionNext());
                    this.section_ptr2blocked[0] = current_edge.getSectionDown();
                } else {

                    this.section_ptr2blocked[0] = (current_edge.getSectionNext()); 

                }
            } else if (blockerX1 <= a1 && blockerX2 < a2)	{							// case 5

                assert(a1 <= blockerX2,
                       'AREdgeList.section_HasBlockedEdge: a1 <= blockerX2 FAILED');

                // Move a1 such that blockerX2 < a1 < a2
                a1 = getLargerEndpoint(blockerX2, a2);

                while((e && e.startpoint !== null) && e.sectionX1 <= a1) {	
                    assert(e.sectionX1 <= e.sectionX2,
                           'AREdgeList.section_HasBlockedEdge: e.sectionX1 <= e.sectionX2 FAILED');

                    if (a1 <= e.sectionX2) {
                        a1 = getLargerEndpoint(e.sectionX2, a2);
                    }

                    o = e;
                    e = e.getSectionNext();
                }

                if (o) {  
                    // Insert current_edge to be section_next of the given edge in the list 
                    // of section_down (basically, collapsing current_edge into the section_down 
                    // list. The values in the list following current_edge will then be set to 
                    // be section_down of the current_edge.)
                    this.section_ptr2blocked[0] = current_edge.getSectionDownPtr()[0];
                    o.setSectionNext(current_edge);
                    current_edge.setSectionDown(e);
                }

                assert(blockerX2 < a1,
                       'AREdgeList.section_HasBlockedEdge: blockerX2 < a1 FAILED');
                //Shifting the front of the p2b so it no longer overlaps this.section_blocker
                current_edge.sectionX1 = a1;

                assert(current_edge.sectionX1 < current_edge.sectionX2, 
                       'current_edge.sectionX1 < current_edge.sectionX2 ('+
                       current_edge.sectionX1 + ' < ' +current_edge.sectionX2+')' );
            } else {														// case 2
                assert(a1 < blockerX1 && blockerX1 <= a2 && a2 <= blockerX2,  "AREdgeList.section_HasBlockedEdge:  a1 < blockerX1 && blockerX1 <= a2 && a2 <= blockerX2 FAILED");

                this.section_ptr2blocked = current_edge.getSectionDownPtr();

                while( e && e.startpoint !== null) {
                    o = e;
                    e = e.getSectionNext();

                    if (o.sectionX2 + 1 < blockerX1 && (e === null || e.startpoint === null || o.sectionX2 + 1 < e.sectionX1)) {
                        this.section_ptr2blocked = o.getSectionNextPtr();
                    }
                }

                if (this.section_ptr2blocked[0].startpoint !== null) {
                    assert(o !== null,
                           'AREdgeList.section_HasBlockedEdge: o != null FAILED');
                    o.setSectionNext(current_edge.getSectionNext());

                    var larger = blockerX1;

                    if (this.section_ptr2blocked[0].sectionX1 < blockerX1) {
                        larger = this.section_ptr2blocked[0].sectionX1;
                    }

                    current_edge.sectionX2 = getSmallerEndpoint(a1, larger);

                    current_edge.setSectionNext(this.section_ptr2blocked[0]);
                    this.section_ptr2blocked[0] = new AutoRouterEdge(); //This seems odd
                    this.section_ptr2blocked = null;

                } else {
                    current_edge.sectionX2 = Math.max(blockerX1 - 1, (blockerX1+a1)/2);
                }

                assert(current_edge.sectionX1 < current_edge.sectionX2);

                this.section_ptr2blocked = current_edge.getSectionNextPtr();
            }
        }

        assert(this.section_ptr2blocked !== null,
               'AREdgeList.section_HasBlockedEdge: this.section_ptr2blocked != null FAILED');
        while (this.section_ptr2blocked[0] !== null && this.section_ptr2blocked[0].startpoint !== null) {
            a1 = this.section_ptr2blocked[0].sectionX1;
            a2 = this.section_ptr2blocked[0].sectionX2;

            //If this.section_ptr2blocked is completely to the left (or above) this.section_blocker
            if (a2 < blockerX1)												// case 1
            {
                this.section_ptr2blocked = this.section_ptr2blocked[0].getSectionNextPtr();

                assert(this.section_ptr2blocked !== null,
                       'AREdgeList.section_HasBlockedEdge: this.section_ptr2blocked != null FAILED');
                continue;
            }
            //If this.section_blocker is completely to the right (or below) this.section_ptr2blocked 
            else if (blockerX2 < a1) {											// case 6
                break;
            }

            if (a1 < blockerX1 && blockerX2 < a2)									// case 3
                //If this.section_ptr2blocked starts before and ends after this.section_blocker
            {
                var x = blockerX1;
                e = this.section_ptr2blocked[0].getSectionDown();

                for(;;) {

                    if (e === null || e.startpoint === null || x < e.sectionX1) { 
                        return true;
                    } else if (x <= e.sectionX2) {
                        x = e.sectionX2 + 1;
                        if (blockerX2 < x) {
                            break;
                        }
                    }

                    e = e.getSectionNext();
                }

                this.section_ptr2blocked = this.section_ptr2blocked[0].getSectionDownPtr(); 
                continue;
            }
            //This leaves the regular partial overlap possibility. They also include this.section_blocker starting before and ending after this.section_ptr2blocked.

            return true;
        }

        assert(this.section_blocker.getSectionNext() === null && 
               (this.section_blocker.getSectionDown() === null || 
                this.section_blocker.getSectionDown().startpoint === null) , 
            "AREdgeList.section_HasBlockedEdge: this.section_blocker.getSectionNext() === null && this.section_blocker.getSectionDown() === null FAILED");

        this.section_blocker.setSectionNext(this.section_ptr2blocked[0]);
        this.section_ptr2blocked[0] = this.section_blocker; // Set anything pointing to this.section_ptr2blocked to point to this.section_blocker (eg, section_down)

        this.section_blocker = null;
        this.section_ptr2blocked = null;

        return false;
    };

    AutoRouterEdgeList.prototype.section_GetBlockedEdge = function () {
        assert(this.section_blocker !== null && this.section_ptr2blocked !== null, "AREdgeList.sectionGetBlockedEdge: this.section_blocker !== null && this.section_ptr2blocked !== null FAILED");

        return this.section_ptr2blocked[0];
    };

    //----Bracket

    AutoRouterEdgeList.prototype.bracket_IsClosing = function (edge) {
        assert(edge !== null, "AREdgeList.bracket_IsClosing: edge !== null FAILED");
        assert(!edge.isStartPointNull() && !edge.isEndPointNull(),
               'AREdgeList.bracket_IsClosing: !edge.isStartPointNull() && !edge.isEndPointNull() FAILED');

        var start = edge.startpoint,
            end = edge.endpoint;

        if (edge.isStartPointPrevNull() || edge.isEndPointNextNull()) {
            return false;
        }

        return this.ishorizontal ?
            (edge.startpointPrev.y < start.y && edge.endpointNext.y < end.y ) :
            (edge.startpointPrev.x < start.x && edge.endpointNext.x < end.x );
    };

    AutoRouterEdgeList.prototype.bracket_IsOpening = function (edge) {
        assert(edge !== null, "AREdgeList.bracket_IsOpening: edge !== null FAILED" );
        assert(!edge.isStartPointNull() && !edge.isEndPointNull(),
               'AREdgeList.bracket_IsOpening: !edge.isStartPointNull() && !edge.isEndPointNull() FAILED');

        var start = edge.startpoint || edge.startpoint,
            end = edge.endpoint || edge.endpoint,
            prev, 
            next;

        if (edge.isStartPointPrevNull() || edge.isEndPointNextNull()) {
            return false;
        }

        next = edge.endpointNext || edge.endpointNext;
        prev = edge.startpointPrev || edge.startpointPrev;

        return this.ishorizontal ?
            (prev.y > start.y && next.y > end.y ) :
            (prev.x > start.x && next.x > end.x );
    };

    AutoRouterEdgeList.prototype.bracket_IsSmallGap = function (blocked, blocker) {
        return this.bracket_IsOpening(blocked) || this.bracket_IsClosing(blocker);
    };

    AutoRouterEdgeList.prototype.bracket_ShouldBeSwitched = function (edge, next) {
        assert(edge !== null && next !== null,
               'AREdgeList.bracket_ShouldBeSwitched: edge !== null && next !== null FAILED');

        var ex = this._position_GetRealX(edge),
            ex1 = ex[0], 
            ex2 = ex[1], 
            eo = this._position_GetRealO(edge),
            eo1 = eo[0], 
            eo2 = eo[1],
            nx = this._position_GetRealX(next),
            nx1 = nx[0], 
            nx2 = nx[1], 
            no = this._position_GetRealO(next),
            no1 = no[0], 
            no2 = no[1];

        var c1, c2;

        if ((nx1 < ex1 && ex1 < nx2 && eo1 > 0 ) || (ex1 < nx1 && nx1 < ex2 && no1 < 0)) {
            c1 = +1;
        } else if (ex1 === nx1 && eo1 === 0 && no1 === 0) {
            c1 = 0;
        } else {
            c1 = -9;
        }

        if ((nx1 < ex2 && ex2 < nx2 && eo2 > 0 ) || (ex1 < nx2 && nx2 < ex2 && no2 < 0)) {
            c2 = +1;
        } else if (ex2 === nx2 && eo2 === 0 && no2 === 0) {
            c2 = 0;
        } else {
            c2 = -9;
        }

        return (c1 + c2) > 0;
    };

    //---Block

    AutoRouterEdgeList.prototype._block_GetF = function (d, b, s) {
        var f = d/(b+s), //f is the total distance between edges divided by the total number of edges
            S = CONSTANTS.EDLS_S, //This is 'SMALLGAP'
            R = CONSTANTS.EDLS_R,//This is 'SMALLGAP + 1'
            D = CONSTANTS.EDLS_D; //This is the total distance of the graph

        //If f is greater than the SMALLGAP, then make some checks/edits
        if (b === 0 && R <= f) { //If every comparison resulted in an overlap AND SMALLGAP + 1 is less than the distance between each edge (in the given range)
            f += (D-R);
        } else if (S < f && s > 0) {
            f = ((D-S)*d - S*(D-R)*s) / ((D-S)*b + (R-S)*s);
        }

        return f;
    };

    AutoRouterEdgeList.prototype._block_GetG = function (d, b, s) {
        var g = d/(b+s),
            S = CONSTANTS.EDLS_S,
            R = CONSTANTS.EDLS_R,
            D = CONSTANTS.EDLS_D;

        if (S < g && b > 0) {
            g = ((R-S)*d + S*(D-R)*b) / ((D-S)*b + (R-S)*s);
        }

        return g;
    };

    //Float equals
    AutoRouterEdgeList.prototype.flt_equ  = function (a, b) {
        return ((a - 0.1) < b) && (b < (a + 0.1));
    };

    AutoRouterEdgeList.prototype.block_PushBackward = function(blocked, blocker) {
        var modified = false;

        assert(blocked !== null && blocker !== null,
               'AREdgeList.block_PushBackward: blocked !== null && blocker !== null FAILED');
               assert(blocked.positionY <= blocker.positionY,
                      'AREdgeList.block_PushBackward: blocked.positionY <= blocker.positionY FAILED');
                      assert(blocked.getBlockPrev() !== null,
                             'AREdgeList.block_PushBackward: blocked.getBlockPrev() !== null FAILED'); 

        var f = 0,
            g = 0,
            edge = blocked,
            trace = blocker,
            d = trace.positionY - edge.positionY;

            assert(d >= 0,
                   'AREdgeList.block_PushBackward: d >= 0 FAILED');

        var s = (edge.bracketOpening || trace.bracketClosing),
            b = 1 - s,
            d2;

        for(;;) {
            edge.setBlockTrace(trace);
            trace = edge;
            edge = edge.getBlockPrev();

            if (edge === null) {
                break;
            }

            d2 = trace.positionY - edge.positionY;
            assert(d2 >= 0,
                   'AREdgeList.block_PushBackward:  d2 >= 0 FAILED');

            if (edge.bracketOpening || trace.bracketClosing) {
                g = this._block_GetG(d,b,s);
                if (d2 <= g) {
                    f = this._block_GetF(d,b,s);
                    break;
                }
                s++;
            }
            else
            {
                f = this._block_GetF(d,b,s);
                if (d2 <= f) {
                    g = this._block_GetG(d,b,s);
                    break;
                }
                b++;
            }

            d += d2;
        }

        if (b+s > 1) {
            if (edge === null) {
                f = this._block_GetF(d,b,s);
                g = this._block_GetG(d,b,s);
            }

            assert(this.flt_equ(d, f*b + g*s),
                   'AREdgeList.block_PushBackward: flt_equ(d, f*b + g*s) FAILED');

            edge = trace;
            assert(edge !== null && edge !== blocked,
                   'AREdgeList.block_PushBackward: edge !== null && edge !== blocked FAILED');

            var y = edge.positionY;

            do
            {
                assert(edge !== null && edge.getBlockTrace() !== null,"AREdgeList.block_PushBackward: edge !== null && edge.getBlockTrace() !== null FAILED");
                trace = edge.getBlockTrace();

                y += (edge.bracketOpening || trace.bracketClosing) ? g : f;

                if (y + 0.001 < trace.positionY) {
                    modified = true;
                    if (this._slideButNotPassEdges(trace, y)) {
                        trace.setBlockPrev(null);
                    }
                }

                edge = trace;
            } while(edge !== blocked);

            if (CONSTANTS.DEBUG) {
                //y += (edge.bracketOpening || blocker.bracketClosing) ? g : f;
                assert(this.flt_equ(y, blocker.positionY),
                       'AREdgeList.block_PushBackward: flt_equ(y, blocker.positionY) FAILED');
            }
        }

        return modified;
    };

    AutoRouterEdgeList.prototype.block_PushForward = function(blocked, blocker) {
        var modified = false;

        assert(blocked !== null && blocker !== null,
               'AREdgeList.block_PushForward: blocked !== null && blocker !== null FAILED');
               assert(blocked.positionY >= blocker.positionY,
                      'AREdgeList.block_PushForward: blocked.positionY >= blocker.positionY FAILED');
                      assert(blocked.getBlockNext() !== null,
                             'AREdgeList.block_PushForward: blocked.getBlockNext() !== null FAILED');

        var f = 0,
            g = 0,
            edge = blocked,
            trace = blocker,
            d = edge.positionY - trace.positionY;

            assert(d >= 0,
                   'AREdgeList.block_PushForward:  d >= 0 FAILED');

        var s = (trace.bracketOpening || edge.bracketClosing),
            b = 1 - s,
            d2;

        for(;;) {
            edge.setBlockTrace(trace);
            trace = edge;
            edge = edge.getBlockNext();

            if (edge === null) {
                break;
            }

            d2 = edge.positionY - trace.positionY;
            assert(d2 >= 0,
                   'AREdgeList.block_PushForward: d2 >= 0 FAILED');

            if (trace.bracketOpening || edge.bracketClosing) {
                g = this._block_GetG(d,b,s);
                if (d2 <= g) {
                    f = this._block_GetF(d,b,s);
                    break;
                }
                s++;
            }
            else
            {
                f = this._block_GetF(d,b,s);
                if (d2 <= f) {
                    g = this._block_GetG(d,b,s);
                    break;
                }
                b++;
            }

            d += d2;
        }

        if (b+s > 1) { //Looking at more than one edge (or edge/trace comparison) {
            if (edge === null) {
                f = this._block_GetF(d,b,s);
                g = this._block_GetG(d,b,s);
            }

            assert(this.flt_equ(d, f*b + g*s),
                   'AREdgeList.block_PushForward: flt_equ(d, f*b + g*s) FAILED');

            edge = trace;
            assert(edge !== null && !edge.equals(blocked),
                   'AREdgeList.block_PushForward: edge != null && !edge.equals(blocked) FAILED');

            var y = edge.positionY;

            do {
                assert(edge !== null && edge.getBlockTrace() !== null,
                       'AREdgeList.block_PushForward: edge !== null && edge.getBlockTrace() !== null FAILED');
                trace = edge.getBlockTrace();

                y -= (trace.bracketOpening || edge.bracketClosing) ? g : f;

                if (trace.positionY < y - 0.001) {
                    modified = true;

                    if (this._slideButNotPassEdges(trace, y)) {
                        trace.setBlockNext(null);
                    }
                }

                edge = trace;
            } while(edge !== blocked);
        }


        return modified;
    };

    AutoRouterEdgeList.prototype.block_ScanForward = function() {
        this._positionAll_LoadX();

        var modified = false;

        this.sectionReset();

        var blocker = this.orderFirst,
blocked,
            bmin,
            smin,
            bmin_f,
            smin_f;

        while (blocker) {
            bmin = null; //block min?
            smin = null; //section min?
            bmin_f = CONSTANTS.ED_MINCOORD - 1;
            smin_f = CONSTANTS.ED_MINCOORD - 1;

            this.section_BeginScan(blocker);
            while (this.section_HasBlockedEdge()) {
                if (this.section_IsImmediate()) {
                    blocked = this.section_GetBlockedEdge();
                    assert(blocked !== null,
                           'AREdgeList.block_PushForward: blocked !== null FAILED');

                    if (blocked.getBlockPrev() !== null) {
                        modified = this.block_PushBackward(blocked, blocker) || modified;
                    }

                    if (!blocker.getEdgeFixed()) {
                        if (blocked.bracketOpening || blocker.bracketClosing) {
                            if (smin_f < blocked.positionY) {
                                smin_f = blocked.positionY;
                                smin = blocked;
                            }
                        }
                        else
                        {
                            if (bmin_f < blocked.positionY) {
                                bmin_f = blocked.positionY;
                                bmin = blocked;
                            }
                        }
                    }
                }

            }

            if (bmin) {
                if (smin) {
                    blocker.setClosestPrev(smin_f > bmin_f ? smin : bmin);

                    bmin_f = blocker.positionY - bmin_f;
                    smin_f = this._block_GetF(blocker.positionY - smin_f, 0, 1);

                    blocker.setBlockPrev(smin_f < bmin_f ? smin : bmin);
                }
                else
                {
                    blocker.setBlockPrev(bmin);
                    blocker.setClosestPrev(bmin);
                }
            }
            else
            {
                blocker.setBlockPrev(smin);
                blocker.setClosestPrev(smin);
            }


            blocker = blocker.orderNext;
        }

        this._positionAll_StoreY();

        return modified;
    };

    AutoRouterEdgeList.prototype.block_ScanBackward = function() {
        this._positionAll_LoadX();

        var modified = false;

        this.sectionReset();
        var blocker = this.orderLast,
            blocked,
            bmin,
            smin,
            bmin_f,
            smin_f;
             
        while(blocker) {
            bmin = null;
            smin = null;
            bmin_f = CONSTANTS.ED_MAXCOORD + 1;
            smin_f = CONSTANTS.ED_MAXCOORD + 1;

            this.section_BeginScan(blocker);

            while(this.section_HasBlockedEdge()) {
                if (this.section_IsImmediate()) {
                    blocked = this.section_GetBlockedEdge();

                    assert(blocked !== null,
                           'AREdgeList.block_ScanBackward: blocked !== null FAILED');

                    if (blocked.getBlockNext() !== null) {
                        modified = this.block_PushForward(blocked, blocker) || modified;
                    }

                    if (!blocker.getEdgeFixed()) {
                        if (blocker.bracketOpening || blocked.bracketClosing) {
                            if (smin_f > blocked.positionY) {
                                smin_f = blocked.positionY;
                                smin = blocked;
                            }
                        }
                        else
                        {
                            if (bmin_f > blocked.positionY) {
                                bmin_f = blocked.positionY;
                                bmin = blocked;
                            }
                        }
                    }
                }
            }

            if (bmin) {
                if (smin) {
                    blocker.setClosestNext(smin_f < bmin_f ? smin : bmin);

                    bmin_f = bmin_f - blocker.positionY;
                    smin_f = this._block_GetF(smin_f - blocker.positionY, 0, 1);

                    blocker.setBlockNext(smin_f < bmin_f ? smin : bmin);
                }
                else
                {
                    blocker.setBlockNext(bmin);    
                    blocker.setClosestNext(bmin); 
                }                                
            }
            else
            {
                blocker.setBlockNext(smin);
                blocker.setClosestNext(smin);
            }

            blocker = blocker.orderPrev;
        }

        this._positionAll_StoreY();

        return modified;
    };

    AutoRouterEdgeList.prototype.block_SwitchWrongs = function() {
        var was = false;

        this._positionAll_LoadX(); 
        var second = this.orderFirst,
            edge,
            next,
            ey,
            ny,
            a;

        while(second !== null) {
            if ( second.getClosestPrev() !== null && second.getClosestPrev().getClosestNext() !== (second) && //Check if it references itself
                    second.getClosestNext() !== null && second.getClosestNext().getClosestPrev() === (second) ) {
                assert(!second.getEdgeFixed(),
                       'AREdgeList.block_SwitchWrongs: !second.getEdgeFixed() FAILED');

                edge = second;
                next = edge.getClosestNext();

                while (next !== null && edge === next.getClosestPrev()) {
                    assert(edge !== null && !edge.getEdgeFixed(),
                           'AREdgeList.block_SwitchWrongs: edge != null && !edge.getEdgeFixed() FAILED');
                           assert(next !== null && !next.getEdgeFixed(),
                                  'AREdgeList.block_SwitchWrongs: next != null && !next.getEdgeFixed() FAILED');

                    ey = edge.positionY;
                    ny = next.positionY;

                    assert(ey <= ny,
                           'AREdgeList.block_SwitchWrongs: ey <= ny FAILED');

                    if (ey + 1 <= ny && this.bracket_ShouldBeSwitched(edge, next)) {
                        was = true;

                        assert(!edge.getEdgeCanpassed() && !next.getEdgeCanpassed(),
                               'AREdgeList.block_SwitchWrongs: !edge.getEdgeCanpassed() && !next.getEdgeCanpassed() FAILED');
                        edge.setEdgeCanpassed(true);
                        next.setEdgeCanpassed(true);

                        a = this._slideButNotPassEdges(edge, (ny+ey)/2 + 0.001) !== null;
                        a = this._slideButNotPassEdges(next, (ny+ey)/2 - 0.001) !== null || a;

                        if (a) {
                            edge.setClosestPrev(null);
                            edge.setClosestNext(null);
                            next.setClosestPrev(null);
                            next.setClosestNext(null);

                            edge.setEdgeCanpassed(false);
                            next.setEdgeCanpassed(false);
                            break;
                        }

                        if (edge.getClosestPrev() !== null && edge.getClosestPrev().getClosestNext() === edge) {
                            edge.getClosestPrev().setClosestNext(next);
                        }

                        if ( next.getClosestNext() !== null && next.getClosestNext().getClosestPrev() === next) {
                            next.getClosestNext().setClosestPrev(edge);
                        }

                        edge.setClosestNext(next.getClosestNext());
                        next.setClosestNext(edge);
                        next.setClosestPrev(edge.getClosestPrev());
                        edge.setClosestPrev(next);

                        edge.setEdgeCanpassed(false);
                        next.setEdgeCanpassed(false);

                        assert(!this.bracket_ShouldBeSwitched(next, edge),
                               'AREdgeList.block_SwitchWrongs: !Bracket_ShouldBeSwitched(next, edge) FAILED');

                        if (next.getClosestPrev() !== null && next.getClosestPrev().getClosestNext() === next) {
                            edge = next.getClosestPrev();
                        } else {
                            next = edge.getClosestNext();
                        }
                    } else {
                        edge = next;
                        next = next.getClosestNext();
                    }
                }
            }

            second = second.orderNext;
        }

        if (was) {
            this._positionAll_StoreY();
        }

        return was;
    };

    AutoRouterEdgeList.prototype.assertValid = function() {
        // Check that all edges have start/end points
        var edge = this.orderFirst;
        while (edge) {
            assert(edge.startpoint.x !== undefined, 'Edge has unrecognized startpoint: '+edge.startpoint);
            assert(edge.endpoint.x !== undefined, 'Edge has unrecognized endpoint: '+edge.endpoint);
            edge = edge.orderNext;
        }
    };

    return AutoRouterEdgeList;
});
