"use strict";

define(['logManager',
    'js/Constants',
    'raphaeljs',
    'loaderCircles',
    'js/Widgets/DiagramDesigner/SelectionManager',
    'js/Widgets/DiagramDesigner/DragManager.Native',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.OperatingModes',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DesignerItems',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Connections',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Subcomponents',
    'js/Widgets/DiagramDesigner/ConnectionRouteManagerBasic',
    'js/Widgets/DiagramDesigner/ConnectionRouteManager2',
    'js/Widgets/DiagramDesigner/ConnectionDrawingManager',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.EventDispatcher',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Zoom',
    'css!/css/Widgets/DiagramDesigner/DiagramDesignerWidget'], function (logManager,
                                                      CONSTANTS,
                                                      raphaeljs,
                                                      LoaderCircles,
                                                      SelectionManager,
                                                      DragManager,
                                                      DiagramDesignerWidgetOperatingModes,
                                                      DiagramDesignerWidgetDesignerItems,
                                                      DiagramDesignerWidgetConnections,
                                                      DiagramDesignerWidgetSubcomponents,
                                                      ConnectionRouteManagerBasic,
                                                      ConnectionRouteManager2,
                                                      ConnectionDrawingManager,
                                                      DiagramDesignerWidgetEventDispatcher,
                                                      DiagramDesignerWidgetZoom) {

    var DiagramDesignerWidget,
        DEFAULT_GRID_SIZE = 10,
        CANVAS_EDGE = 100,
        ITEMS_CONTAINER_ACCEPT_DROPPABLE_CLASS = "accept-droppable",
        WIDGET_CLASS = 'diagram-designer',  // must be same as scss/Widgets/DiagramDesignerWidget.scss
        DEFAULT_ZOOM_VALUES = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];  

    DiagramDesignerWidget = function (container, params) {
        var self = this;

        this.logger = logManager.create(params.loggerName || "DiagramDesignerWidget");

        this.$el = container;
        this.toolBar = params.toolBar;

        //transform this instance into EventDispatcher
        this._addEventDispatcherExtensions();

        //Get DiagramDesignerWidget parameters from options
        //Grid size for item positioning granularity
        this.gridSize = params.gridSize || DEFAULT_GRID_SIZE;
        this._droppable = params.droppable !== false ? true :false;

        //define properties of its own
        this._defaultSize = { "w": 10, "h": 10 };
        this._actualSize = { "w": 0, "h": 0 };
        this._containerSize = { "w": 0, "h": 0 };
        this._itemIDCounter = 0;
        this._documentFragment = document.createDocumentFragment();

        this._offset = { "left": 0, "top": 0 };
        this._scrollPos = { "left": 0, "top": 0 };

        //set default mode to NORMAL
        this.mode = this.OPERATING_MODES.NORMAL;
        this._updating = false;

        this._initializeCollections();

        //initialize UI
        this.initializeUI();

        this._zoom = 1.0;
        this._zoomValues = params.zoomValues || DEFAULT_ZOOM_VALUES;
        this._initZoom();

        //initiate Selection Manager (if needed)
        this.selectionManager = params.selectionManager || new SelectionManager({"canvas": this});
        this.selectionManager.initialize(this.skinParts.$itemsContainer);
        this.selectionManager.onSelectionDeleteClicked = function (selectedIds) {
            self._onSelectionDeleteClicked(selectedIds);
        };

        this.selectionManager.onSelectionChanged = function (selectedIds) {
            self._onSelectionChanged(selectedIds);
        };

        //initiate Drag Manager (if needed)
        this.dragManager = params.dragManager || new DragManager({"canvas": this});
        this.dragManager.initialize(this.skinParts.$itemsContainer);

        //initiate Connection Router (if needed)
        this.connectionRouteManager = params.connectionRouteManager || new ConnectionRouteManagerBasic({"canvas": this});
        this.connectionRouteManager.initialize();

        //initiate Connection drawer component (if needed)
        this.connectionDrawingManager = params.connectionDrawingManager || new ConnectionDrawingManager({"canvas": this});
        this.connectionDrawingManager.initialize();

        /************** ROUTING MANAGER SELECTION **************************/
        if (DEBUG === true) {
            this.$btnGroupConnectionRouteManager = this.toolBar.addButtonGroup(function (event, data) {
                self._onConnectionRouteManagerChanged(data.type);
            });

            this.toolBar.addButton({ "title": "Basic route manager",
                "text": "RM #1",
                "data": { "type": "basic"}}, this.$btnGroupConnectionRouteManager );

            this.toolBar.addButton({ "title": "Basic+ route manager",
                "text": "RM #2",
                "data": { "type": "basic2"}}, this.$btnGroupConnectionRouteManager );
        }
        /************** END OF - ROUTING MANAGER SELECTION **************************/

        this.logger.debug("DiagramDesignerWidget ctor finished");
    };

    DiagramDesignerWidget.prototype._initializeCollections = function () {
        //all the designer items and connections
        this.items = {};

        //IDs of items
        this.itemIds = [];

        //IDs of connections
        this.connectionIds = [];

        //additional helpers for connection accounting
        this.connectionEndIDs = {};
        this.connectionIDbyEndID = {};

        this._updating = false;

        /*designer item accounting*/
        this._insertedDesignerItemIDs = [];
        this._updatedDesignerItemIDs = [];
        this._deletedDesignerItemIDs = [];

        /*connection accounting*/
        this._insertedConnectionIDs = [];
        this._updatedConnectionIDs = [];
        this._deletedConnectionIDs = [];

        this._itemSubcomponentsMap = {};
    };

    DiagramDesignerWidget.prototype.getGuid = function (prefix) {
        var nextID = (prefix || "") + this._itemIDCounter + "";

        this._itemIDCounter++;

        return nextID;
    };

    /**************************** READ-ONLY MODE HANDLERS ************************/

    /* OVERRIDE FROM WIDGET-WITH-HEADER */
    /* METHOD CALLED WHEN THE WIDGET'S READ-ONLY PROPERTY CHANGES */
    DiagramDesignerWidget.prototype.setReadOnly = function (isReadOnly) {
        this._setReadOnlyMode(isReadOnly);
    };

    DiagramDesignerWidget.prototype.getIsReadOnlyMode = function () {
        return this.mode === this.OPERATING_MODES.READ_ONLY;
    };

    DiagramDesignerWidget.prototype._setReadOnlyMode = function (readOnly) {
        if (readOnly === true && this.mode !== this.OPERATING_MODES.READ_ONLY) {
            //enter READ-ONLY mode
            this.mode = this.OPERATING_MODES.READ_ONLY;
            this._readOnlyOn();
        } else if (readOnly === false && this.mode === this.OPERATING_MODES.READ_ONLY) {
            //enter normal mode from read-only
            this.mode = this.OPERATING_MODES.NORMAL;
            this._readOnlyOff();
        }
    };

    DiagramDesignerWidget.prototype._readOnlyOn = function () {
        this._setManagersReadOnlyMode(true);
    };

    DiagramDesignerWidget.prototype._readOnlyOff = function () {
        this._setManagersReadOnlyMode(false);
    };

    DiagramDesignerWidget.prototype._setManagersReadOnlyMode = function (readOnly) {
        var i;
        this.selectionManager.readOnlyMode(readOnly);
        this.connectionDrawingManager.readOnlyMode(readOnly);

        i = this.itemIds.length;
        while (i--) {
            this.items[this.itemIds[i]].readOnlyMode(readOnly);
        }

        i = this.connectionIds.length;
        while (i--) {
            this.items[this.connectionIds[i]].readOnlyMode(readOnly);
        }
    };

    /**************************** END OF --- READ-ONLY MODE HANDLERS ************************/


    /****************** PUBLIC FUNCTIONS ***********************************/

    //Called when the widget's container size changed
    DiagramDesignerWidget.prototype.onWidgetContainerResize = function (width, height) {

        //call our own resize handler
        this._resizeItemContainer(width, height);

        this._containerSize.w = width;
        this._containerSize.h = height;
    };

    DiagramDesignerWidget.prototype.destroy = function () {
        this.__loader.destroy();
        //TODO: what about item and connection destroys????
    };

    DiagramDesignerWidget.prototype.initializeUI = function () {
        var self = this;

        this.logger.debug("DiagramDesignerWidget.initializeUI");

        //clear content
        this.$el.empty();

        //add own class
        this.$el.addClass(WIDGET_CLASS);

        this._attachScrollHandler(this.$el);

        //DESIGNER CANVAS HEADER
        this.skinParts = {};

        //TODO: $diagramDesignerWidgetBody --> this.$el;
        this.skinParts.$diagramDesignerWidgetBody = this.$el;

        if (DEBUG === true) {
            this.skinParts.$progressText = this.toolBar.addLabel();
        }

        /******** ADDITIONAL BUTTON GROUP CONTAINER**************/
        //add extra visual piece
        this.skinParts.$btnGroupItemAutoOptions = this.toolBar.addButtonGroup(function (event, data) {
            self._itemAutoLayout(data.mode);
        });

        this.toolBar.addButton({ "title": "Grid layout",
            "icon": "icon-th",
            "data": { "mode": "grid" }}, this.skinParts.$btnGroupItemAutoOptions );

        this.toolBar.addButton({ "title": "Diagonal",
            "icon": "icon-signal",
            "data": { "mode": "diagonal" }}, this.skinParts.$btnGroupItemAutoOptions );

        //CHILDREN container
        this.skinParts.$itemsContainer = $('<div/>', {
            "class" : "items"
        });
        this.skinParts.$diagramDesignerWidgetBody.append(this.skinParts.$itemsContainer);

        //initialize Raphael paper from children container and set it to be full size of the HTML container
        this.skinParts.SVGPaper = Raphael(this.skinParts.$itemsContainer[0]);
        this.skinParts.SVGPaper.canvas.style.pointerEvents = "visiblePainted";

        //finally resize the whole content according to available space
        this._resizeItemContainer();

        if (this._droppable === true) {
            //hook up drop event handler on children container

            this._acceptDroppable = false;

            this.skinParts.$dropRegion = $('<div/>', { "class" :"dropRegion" });

            this.skinParts.$diagramDesignerWidgetBody.append(this.skinParts.$dropRegion);

            /* SET UP DROPPABLE DROP REGION */
            this.skinParts.$dropRegion.droppable({
                over: function( event, ui ) {
                    self._onBackgroundDroppableOver(ui);
                },
                out: function( event, ui ) {
                    self._onBackgroundDroppableOut(ui);
                },
                drop: function (event, ui) {
                    self._onBackgroundDrop(event, ui);
                },
                activate: function( event, ui ) {
                    var m = 0;
                    if (ui.helper) {
                        if (self.mode === self.OPERATING_MODES.NORMAL) {
                            self.skinParts.$dropRegion.css({"width": self._containerSize.w - 2 * m,
                                "height": self._containerSize.h - 2 * m,
                                "top": self._scrollPos.top + m,
                                "left": self._scrollPos.left + m });
                        }    
                    }
                },
                deactivate: function( event, ui ) {
                    self.skinParts.$dropRegion.css({"width": "0px",
                        "height": "0px",
                        "top": "0px",
                        "left": "0px"});
                }
            });
        }

        this.__loader = new LoaderCircles({"containerElement": this.$el.parent()});
    };

    DiagramDesignerWidget.prototype._attachScrollHandler = function (el) {
        var self = this;

        el.on('scroll', function (event) {
            self._scrollPos.left = el.scrollLeft();
            self._scrollPos.top = el.scrollTop();
        });
    };

    DiagramDesignerWidget.prototype._resizeItemContainer = function (width, height) {
        if (width === undefined) {
            width = this.$el.width();
        }
        if (height === undefined) {
            height = this.$el.height();
        }
        this._actualSize.w = Math.max(this._actualSize.w, width);
        this._actualSize.h = Math.max(this._actualSize.h, height);

        this.skinParts.$itemsContainer.css({"width": this._actualSize.w,
            "height": this._actualSize.h});

        this.skinParts.SVGPaper.setSize(this._actualSize.w, this._actualSize.h);
        this.skinParts.SVGPaper.setViewBox(0, 0, this._actualSize.w, this._actualSize.h, false);

        this._centerBackgroundText();

        this._offset = this.skinParts.$diagramDesignerWidgetBody.offset();
    };

    DiagramDesignerWidget.prototype.getAdjustedMousePos = function (e) {
        var childrenContainerOffset = this._offset,
            childrenContainerScroll = this._scrollPos,
            pX = e.pageX - childrenContainerOffset.left + childrenContainerScroll.left,
            pY = e.pageY - childrenContainerOffset.top + childrenContainerScroll.top;

        pX /= this._zoom;
        pY /= this._zoom;

        return { "mX": pX > 0 ? pX : 0,
            "mY": pY > 0 ? pY : 0 };
    };

    DiagramDesignerWidget.prototype.getAdjustedOffset = function (offset) {
        var childrenContainerOffset = this._offset,
            left = (offset.left - childrenContainerOffset.left) / this._zoom + childrenContainerOffset.left,
            top = (offset.top - childrenContainerOffset.top) / this._zoom + childrenContainerOffset.top;

        return { "left": left,
            "top": top };
    };

    DiagramDesignerWidget.prototype.clear = function () {
        var i;

        this.selectionManager.clear(); 

        for (i in this.items) {
            if (this.items.hasOwnProperty(i)) {
                this.items[i].destroy();
            }
        }

        //initialize all the required collections with empty value
        this._initializeCollections();

        this._actualSize = { "w": 0, "h": 0 };

        this._resizeItemContainer();
    };

    DiagramDesignerWidget.prototype.deleteComponent = function (componentId) {
        //TODO: fix --> if connectiondraw is in progress and the source of the in-drawn-connection is deleted, cancel the draw

        //let the selection manager know about item deletion
        //NOTE: it is handled in _refreshScreen()

        //if there is dragging and let the dragmanager know about the deletion
        if (this.mode === this.OPERATING_MODES.MOVE_ITEMS ||
            this.mode === this.OPERATING_MODES.COPY_ITEMS) {
            this.dragManager.componentDelete(componentId);
        }

        //if there is connection draw or redraw, let the connection manager know about the deletion
        if (this.mode === this.OPERATING_MODES.CREATE_CONNECTION ||
            this.mode === this.OPERATING_MODES.RECONNECT_CONNECTION) {
            this.connectionDrawingManager.componentDelete(componentId);
        }

        //let the selection manager know about the deletion
        this.selectionManager.componentsDeleted([componentId]);

        //finally delete the component
        if (this.itemIds.indexOf(componentId) !== -1) {
            this.deleteDesignerItem(componentId);
        } else if (this.connectionIds.indexOf(componentId) !== -1) {
            this.deleteConnection(componentId);
        }
    };

    /*********************************/

    DiagramDesignerWidget.prototype.beginUpdate = function () {
        this.logger.debug("beginUpdate");

        this._updating = true;

        /*designer item accounting*/
        this._insertedDesignerItemIDs = [];
        this._updatedDesignerItemIDs = [];
        this._deletedDesignerItemIDs = [];

        /*connection accounting*/
        this._insertedConnectionIDs = [];
        this._updatedConnectionIDs = [];
        this._deletedConnectionIDs = [];
    };

    DiagramDesignerWidget.prototype.endUpdate = function () {
        this.logger.debug("endUpdate");

        this._updating = false;
        this.tryRefreshScreen();
    };

    DiagramDesignerWidget.prototype.decoratorUpdated = function (itemID) {
        this.logger.error("DecoratorUpdated: '" + itemID + "'");

        this.tryRefreshScreen();
    };

    DiagramDesignerWidget.prototype.tryRefreshScreen = function () {
        var insertedLen = 0,
            updatedLen = 0,
            deletedLen = 0,
            msg = "";

        //check whether controller update finished or not
        if (this._updating !== true) {

            insertedLen += this._insertedDesignerItemIDs ? this._insertedDesignerItemIDs.length : 0 ;
            insertedLen += this._insertedConnectionIDs ? this._insertedConnectionIDs.length : 0 ;

            updatedLen += this._updatedDesignerItemIDs ? this._updatedDesignerItemIDs.length : 0 ;
            updatedLen += this._updatedConnectionIDs ? this._updatedConnectionIDs.length : 0 ;

            deletedLen += this._deletedDesignerItemIDs ? this._deletedDesignerItemIDs.length : 0 ;
            deletedLen += this._deletedConnectionIDs ? this._deletedConnectionIDs.length : 0 ;

            msg += "I: " + insertedLen;
            msg += " U: " + updatedLen;
            msg += " D: " + deletedLen;

            this.logger.debug(msg);
            if (DEBUG === true) {
                this.skinParts.$progressText.text(msg);
            }

            this._refreshScreen();
        }
    };

    DiagramDesignerWidget.prototype._refreshScreen = function () {
        var i,
            connectionIDsToUpdate,
            maxWidth = 0,
            maxHeight = 0,
            itemBBox,
            redrawnConnectionIDs,
            doRenderGetLayout,
            doRenderSetLayout,
            items = this.items,
            affectedItems = [];

        this.logger.debug("_refreshScreen START");

        //TODO: updated items probably touched the DOM for modification
        //hopefully none of them forced a reflow by reading values, only setting values
        //browsers will optimize this
        //http://www.phpied.com/rendering-repaint-reflowrelayout-restyle/ --- BROWSER ARE SMART

        /***************** FIRST HANDLE THE DESIGNER ITEMS *****************/
        //add all the inserted items, they are still on a document Fragment
        this.skinParts.$itemsContainer[0].appendChild(this._documentFragment);
        this._documentFragment = document.createDocumentFragment();

        //STEP 1: call the inserted and updated items' getRenderLayout
        doRenderGetLayout = function (itemIDList) {
            var i = itemIDList.length,
                itemBBox,
                cItem;

            while (i--) {
                cItem = items[itemIDList[i]];
                cItem.renderGetLayoutInfo();

                itemBBox = cItem.getBoundingBox();
                maxWidth = Math.max(maxWidth, itemBBox.x2);
                maxHeight = Math.max(maxHeight, itemBBox.y2);
            }
        };
        doRenderGetLayout(this._insertedDesignerItemIDs);
        doRenderGetLayout(this._updatedDesignerItemIDs);

        //STEP 2: call the inserted and updated items' setRenderLayout
        doRenderSetLayout = function (itemIDList) {
            var i = itemIDList.length,
                cItem;

            while (i--) {
                cItem = items[itemIDList[i]];
                cItem.renderSetLayoutInfo();
            }
        };
        
        doRenderSetLayout(this._insertedDesignerItemIDs);
        doRenderSetLayout(this._updatedDesignerItemIDs);


        /***************** THEN HANDLE THE CONNECTIONS *****************/

        //get all the connections that needs to be updated
        // - inserted connections
        // - updated connections
        // - connections that are affected because of
        //      - endpoint appearance
        //      - endpoint remove
        //      - endpoint updated
        //TODO: fix this, but right now we call refresh on all of the connections
        affectedItems = this._insertedDesignerItemIDs.concat(this._updatedDesignerItemIDs, this._deletedDesignerItemIDs);

        connectionIDsToUpdate = this._getAssociatedConnectionsForItems(affectedItems).concat(this._insertedConnectionIDs, this._updatedConnectionIDs);
        connectionIDsToUpdate = _.uniq(connectionIDsToUpdate);

        this.logger.debug('Redraw connection request: ' + connectionIDsToUpdate.length + '/' + this.connectionIds.length);

        redrawnConnectionIDs = this.connectionRouteManager.redrawConnections(connectionIDsToUpdate) || [];

        this.logger.debug('Redrawn/Requested: ' + redrawnConnectionIDs.length + '/' + connectionIDsToUpdate.length);

        i = redrawnConnectionIDs.length;

        while(i--) {
            itemBBox = items[redrawnConnectionIDs[i]].getBoundingBox();
            maxWidth = Math.max(maxWidth, itemBBox.x2);
            maxHeight = Math.max(maxHeight, itemBBox.y2);
        }

        //adjust the canvas size to the new 'grown' are that the inserted / updated require
        //TODO: canvas size decrease not handled yet
        this._resizeItemContainer(maxWidth + CANVAS_EDGE, maxHeight + CANVAS_EDGE);

        //let the selection manager know about deleted items and connections
        this.selectionManager.componentsDeleted(this._deletedDesignerItemIDs.concat(this._deletedConnectionIDs));

        /* clear collections */
        this._insertedDesignerItemIDs = [];
        this._updatedDesignerItemIDs = [];
        this._deletedDesignerItemIDs = []

        this._insertedConnectionIDs = [];
        this._updatedConnectionIDs = [];
        this._deletedConnectionIDs = [];

        if (this.mode === this.OPERATING_MODES.NORMAL ||
            this.mode === this.OPERATING_MODES.READ_ONLY) {
            this.selectionManager.showSelectionOutline();    
        }

        this.logger.debug("_refreshScreen END");
    };

    /*************** MODEL CREATE / UPDATE / DELETE ***********************/

    DiagramDesignerWidget.prototype._alignPositionToGrid = function (pX, pY) {
        var posXDelta,
            posYDelta;

        if (pX < 0) {
            pX = this.gridSize;
        }

        if (pY < 0) {
            pY = this.gridSize;
        }

        if (this.gridSize > 1) {
            posXDelta = pX % this.gridSize;
            posYDelta = pY % this.gridSize;

            if ((posXDelta !== 0) || (posYDelta !== 0)) {
                pX += (posXDelta < Math.floor(this.gridSize / 2) + 1 ? -1 * posXDelta : this.gridSize - posXDelta);
                pY += (posYDelta < Math.floor(this.gridSize / 2) + 1 ? -1 * posYDelta : this.gridSize - posYDelta);
            }
        }

        return { "x": pX,
            "y": pY };
    };

    DiagramDesignerWidget.prototype._checkPositionOverlap = function (itemId, objDescriptor) {
        var i,
            posChanged = true,
            itemID,
            item;

        //check if position has to be adjusted to not to put it on some other model
        while (posChanged === true) {
            posChanged = false;
            i = this.itemIds.length;

            while (i--) {
                itemID = this.itemIds[i];

                if (itemID !== itemId) {
                    item = this.items[itemID];

                    if (objDescriptor.position.x === item.positionX &&
                        objDescriptor.position.y === item.positionY) {
                        objDescriptor.position.x += this.gridSize * 2;
                        objDescriptor.position.y += this.gridSize * 2;
                        posChanged = true;
                    }
                }
            }
        }
    };

    DiagramDesignerWidget.prototype.onItemMouseDown = function (event, itemId) {
        this.logger.debug("onItemMouseDown: " + itemId);

        //mousedown initiates a component selection
        this.selectionManager.setSelection([itemId], event);
    };

    DiagramDesignerWidget.prototype.onConnectionMouseDown = function (event, connId) {
        this.logger.debug("onConnectionMouseDown: " + connId);

        //mousedown initiates a connection selection
        this.selectionManager.setSelection([connId], event);
    };

    /************************** DRAG ITEM ***************************/
    DiagramDesignerWidget.prototype.onDesignerItemDragStart = function (draggedItemId, allDraggedItemIDs) {
        this.selectionManager.hideSelectionOutline();

        var len = allDraggedItemIDs.length;
        while (len--) {
            this.items[allDraggedItemIDs[len]].hideConnectors();
        }
    };

    DiagramDesignerWidget.prototype.onDesignerItemDrag = function (draggedItemId, allDraggedItemIDs) {
        var i = allDraggedItemIDs.length,
            connectionIDsToUpdate,
            redrawnConnectionIDs;

        //refresh only the connections that are really needed
        connectionIDsToUpdate = this._getAssociatedConnectionsForItems(allDraggedItemIDs);
        
        this.logger.debug('Redraw connection request: ' + connectionIDsToUpdate.length + '/' + this.connectionIds.length);

        redrawnConnectionIDs = this.connectionRouteManager.redrawConnections(connectionIDsToUpdate) || [];

        this.logger.debug('Redrawn/Requested: ' + redrawnConnectionIDs.length + '/' + connectionIDsToUpdate.length);

        i = redrawnConnectionIDs.len;
    };

    DiagramDesignerWidget.prototype.onDesignerItemDragStop = function (draggedItemId, allDraggedItemIDs) {
        this.selectionManager.showSelectionOutline();
    };

    /************************** END - DRAG ITEM ***************************/

    /************************** SELECTION DELETE CLICK HANDLER ****************************/

    DiagramDesignerWidget.prototype._onSelectionDeleteClicked = function (selectedIds) {
        this.onSelectionDelete(selectedIds);
    };

    DiagramDesignerWidget.prototype.onSelectionDelete = function (selectedIds) {
        this.logger.warning("DiagramDesignerWidget.onSelectionDelete IS NOT OVERRIDDEN IN A CONTROLLER. ID: '" + selectedIds + "'");
    };

    /************************** SELECTION DELETE CLICK HANDLER ****************************/

    /************************** SELECTION CHANGED HANDLER ****************************/

    DiagramDesignerWidget.prototype._onSelectionChanged = function (selectedIds) {
        this.onSelectionChanged(selectedIds);
    };

    DiagramDesignerWidget.prototype.onSelectionChanged = function (selectedIds) {
        this.logger.debug("DiagramDesignerWidget.onSelectionChanged IS NOT OVERRIDDEN IN A CONTROLLER...");
    };

    /************************** END OF - SELECTION CHANGED HANDLER ****************************/

    /********************** ITEM AUTO LAYOUT ****************************/

    DiagramDesignerWidget.prototype._itemAutoLayout = function (mode) {
        var i = this.itemIds.length,
            x = 10,
            y = 10,
            dx = 20,
            dy = 20,
            w,
            h = 0,
            newPositions = {};

        this.beginUpdate();

        switch (mode) {
            case "grid":
                while (i--) {
                    w = this.items[this.itemIds[i]].width;
                    h = Math.max(h, this.items[this.itemIds[i]].height);
                    this.updateDesignerItem(this.itemIds[i], {"position": {"x": x, "y": y}});
                    newPositions[this.itemIds[i]] = { "x": this.items[this.itemIds[i]].positionX, "y": this.items[this.itemIds[i]].positionY };
                    x += w + dx;
                    if (x >= 1000) {
                        x = 10;
                        y += h + dy;
                        h = 0;
                    }
                }
                break;
            case "diagonal":
                while (i--) {
                    w = this.items[this.itemIds[i]].width;
                    h = Math.max(h, this.items[this.itemIds[i]].height);
                    this.updateDesignerItem(this.itemIds[i], {"position": {"x": x, "y": y}});
                    newPositions[this.itemIds[i]] = { "x": this.items[this.itemIds[i]].positionX, "y": this.items[this.itemIds[i]].positionY };
                    x += w + dx;
                    y += h + dy;
                }
                break;
            default:
                break;
        }

        this.endUpdate();

        this.onDesignerItemsMove(newPositions);
    };

    /********************************************************************/

    /********* ROUTE MANAGER CHANGE **********************/

    DiagramDesignerWidget.prototype._onConnectionRouteManagerChanged = function (type) {
        switch(type) {
            case "basic":
                this.connectionRouteManager = new ConnectionRouteManagerBasic({"canvas": this});
                break;
            case "basic2":
                this.connectionRouteManager = new ConnectionRouteManager2({"canvas": this});
                break;
            default:
                this.connectionRouteManager = new ConnectionRouteManagerBasic({"canvas": this});
                break;
        }

        this.connectionRouteManager.initialize();

        this.connectionRouteManager.redrawConnections(this.connectionIds.slice(0) || []) ;
    };

    /********* ROUTE MANAGER CHANGE **********************/

    /************** ITEM CONTAINER DROPPABLE HANDLERS *************/

    DiagramDesignerWidget.prototype._onBackgroundDroppableOver = function (ui) {
        var helper = ui.helper;

        if (this.onBackgroundDroppableAccept(helper) === true) {
            this._doAcceptDroppable(true);
        }
    };

    DiagramDesignerWidget.prototype._onBackgroundDroppableOut = function (/*ui*/) {
        this._doAcceptDroppable(false);
    };

    DiagramDesignerWidget.prototype._onBackgroundDrop = function (event, ui) {
        var helper = ui.helper,
            mPos = this.getAdjustedMousePos(event),
            posX = mPos.mX,
            posY = mPos.mY;

        if (this._acceptDroppable === true) {
            this.onBackgroundDrop(helper, { "x": posX, "y": posY });
        }

        this._doAcceptDroppable(false);
    };

    DiagramDesignerWidget.prototype._doAcceptDroppable = function (accept) {
        if (accept === true) {
            this._acceptDroppable = true;
            this.skinParts.$dropRegion.addClass(ITEMS_CONTAINER_ACCEPT_DROPPABLE_CLASS);
        } else {
            this._acceptDroppable = false;
            this.skinParts.$dropRegion.removeClass(ITEMS_CONTAINER_ACCEPT_DROPPABLE_CLASS);
        }
    };

    DiagramDesignerWidget.prototype.onBackgroundDroppableAccept = function (helper) {
        this.logger.warning("DiagramDesignerWidget.prototype.onBackgroundDroppableAccept not overridden in controller!!!");
        return false;
    };

    DiagramDesignerWidget.prototype.onBackgroundDrop = function (helper, position) {
        this.logger.warning("DiagramDesignerWidget.prototype.onBackgroundDrop not overridden in controller!!! position: '" + JSON.stringify(position) + "'");
    };

    /*********** END OF - ITEM CONTAINER DROPPABLE HANDLERS **********/

    
    /********** GET THE CONNECTIONS THAT GO IN / OUT OF ITEMS ********/

    DiagramDesignerWidget.prototype._getAssociatedConnectionsForItems = function (itemIdList) {
        var connList = [],
            len = itemIdList.length;

        while (len--) {
            connList = connList.concat(this._getConnectionsForItem(itemIdList[len]));
        }

        connList = _.uniq(connList);

        return connList;
    };

    DiagramDesignerWidget.prototype._getConnectionsForItem = function (itemId) {
        var connList = [],
            subCompId;

        //get all the item's connection and all its subcomponents' connections
        for (subCompId in this.connectionIDbyEndID[itemId]) {
            if (this.connectionIDbyEndID[itemId].hasOwnProperty(subCompId)) {
                connList = connList.concat(this.connectionIDbyEndID[itemId][subCompId]);
            }
        }

        connList = _.uniq(connList);
        
        return connList;
    };

    /***** END OF - GET THE CONNECTIONS THAT GO IN / OUT OF ITEMS ****/

    /************** WAITPROGRESS *********************/
    DiagramDesignerWidget.prototype.showPogressbar = function () {
        this.__loader.start();
    };

    DiagramDesignerWidget.prototype.hidePogressbar = function () {
        this.__loader.stop();
    };

    /************** END OF - WAITPROGRESS *********************/


    /*************       BACKGROUND TEXT      *****************/

    DiagramDesignerWidget.prototype.setBackgroundText = function (text, params) {
        var svgParams = {},
            setSvgAttrFromParams;

        if (!this._backGroundText ) {
            if (!text) {
                this.logger.error("Invalid parameter 'text' for method 'setBackgroundText'");
            } else {
                this._backGroundText = this.skinParts.SVGPaper.text(this._actualSize.w / 2, this._actualSize.h / 2, text);    
            }
        } else {
            svgParams.text = text;
            svgParams.x = this._actualSize.w / 2;
            svgParams.y = this._actualSize.h / 2;
        }

        if (this._backGroundText) {

            setSvgAttrFromParams = function (attrs) {
                var len = attrs.length;
                while (len--) {
                    if (params.hasOwnProperty(attrs[len][0])) {
                        svgParams[attrs[len][1]] = params[attrs[len][0]];
                    }
                }
            };

            if (params) {
                setSvgAttrFromParams([['color', 'fill'],
                                 ['font-size', 'font-size']]);
            }
            
            this._backGroundText.attr(svgParams);
        }
    };

    DiagramDesignerWidget.prototype._centerBackgroundText = function () {
        if (this._backGroundText) {
            this._backGroundText.attr({"x" : this._actualSize.w / 2,
                                       "y" : this._actualSize.h / 2});
        }
    };

    /*************   END OF - BACKGROUND TEXT      *****************/

    DiagramDesignerWidget.prototype.setTitle = function () {
        //no place for title in the widget
        //but could be overriden in the host component
    };

    /************** API REGARDING TO MANAGERS ***********************/

    DiagramDesignerWidget.prototype.enableDragCopy = function (enabled) {
        this.dragManager.enableMode( this.dragManager.DRAGMODE_COPY, enabled);
    };

    /************** END OF - API REGARDING TO MANAGERS ***********************/

    //additional code pieces for DiagramDesignerWidget
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetOperatingModes.prototype);
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetDesignerItems.prototype);
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetConnections.prototype);
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetSubcomponents.prototype);
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetEventDispatcher.prototype);
    _.extend(DiagramDesignerWidget.prototype, DiagramDesignerWidgetZoom.prototype);


    return DiagramDesignerWidget;
});