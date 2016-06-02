/*
Copyright (C) 2011-2016 by Wendy Liu, Evan Magoni, Andrew Hankinson, Andrew Horwitz, Laurent Pugin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var jQuery = require('jquery');

var elt = require('./utils/elt');
var HashParams = require('./utils/hash-params');

var ActiveDivaController = require('./active-diva-controller');
var diva = require('./diva-global');
var ImageManifest = require('./image-manifest');
var createToolbar = require('./toolbar');
var ViewerCore = require('./viewer-core');

// Start the active Diva tracker
// FIXME(wabain): Could defer this, if the logic isn't just getting removed
var activeDiva = new ActiveDivaController(); // jshint ignore: line

module.exports = diva;

// this pattern was taken from http://www.virgentech.com/blog/2009/10/building-object-oriented-jquery-plugin.html
(function ($)
{
    var Diva = function (element, options)
    {
        // Global instance variables (set way down in `init`)
        var settings, viewerState, divaState;
        var self = this;

        // These are elements that can be overridden upon instantiation
        // See https://github.com/DDMAL/diva.js/wiki/Settings for more details
        options = $.extend({
            adaptivePadding: 0.05,      // The ratio of padding to the page dimension
            arrowScrollAmount: 40,      // The amount (in pixels) to scroll by when using arrow keys
            blockMobileMove: false,     // Prevent moving or scrolling the page on mobile devices
            objectData: '',             // A IIIF Manifest or a JSON file generated by process.py that provides the object dimension data, or a URL pointing to such data - *REQUIRED*
            enableAutoTitle: true,      // Shows the title within a div of id diva-title
            enableFilename: true,       // Uses filenames and not page numbers for links (i=bm_001.tif, not p=1)
            enableFullscreen: true,     // Enable or disable fullscreen icon (mode still available)
            enableGotoPage: true,       // A "go to page" jump box
            enableGridIcon: true,       // A grid view of all the pages
            enableGridControls: 'buttons',  // Specify control of pages per grid row in Grid view. Possible values: 'buttons' (+/-), 'slider'. Any other value disables the controls.
            enableImageTitles: true,    // Adds "Page {n}" title to page images if true
            enableKeyScroll: true,      // Captures scrolling using the arrow and page up/down keys regardless of page focus. When off, defers to default browser scrolling behavior.
            enableLinkIcon: true,       // Controls the visibility of the link icon
            enableSpaceScroll: false,   // Scrolling down by pressing the space key
            enableToolbar: true,        // Enables the toolbar. Note that disabling this means you have to handle all controls yourself.
            enableZoomControls: 'buttons', // Specify controls for zooming in and out. Possible values: 'buttons' (+/-), 'slider'. Any other value disables the controls.
            fixedPadding: 10,           // Fallback if adaptive padding is set to 0
            fixedHeightGrid: true,      // So each page in grid view has the same height (only widths differ)
            goDirectlyTo: 0,            // Default initial page to show (0-indexed)
            iipServerURL: '',           // The URL to the IIPImage installation, including the `?FIF=` - *REQUIRED*, unless using IIIF
            inFullscreen: false,        // Set to true to load fullscreen mode initially
            inBookLayout: false,       // Set to true to view the document with facing pages in document mode
            inGrid: false,              // Set to true to load grid view initially
            imageDir: '',               // Image directory, either absolute path or relative to IIP's FILESYSTEM_PREFIX - *REQUIRED*, unless using IIIF
            maxPagesPerRow: 8,          // Maximum number of pages per row in grid view
            maxZoomLevel: -1,           // Optional; defaults to the max zoom returned in the JSON response
            minPagesPerRow: 2,          // Minimum pages per row in grid view. Recommended default.
            minZoomLevel: 0,            // Defaults to 0 (the minimum zoom)
            pageLoadTimeout: 200,       // Number of milliseconds to wait before loading pages
            pagesPerRow: 5,             // The default number of pages per row in grid view
            rowLoadTimeout: 50,         // Number of milliseconds to wait before loading a row
            throbberTimeout: 100,       // Number of milliseconds to wait before showing throbber
            tileHeight: 256,            // The height of each tile, in pixels; usually 256
            tileWidth: 256,             // The width of each tile, in pixels; usually 256
            toolbarParentObject: $(element), // The toolbar parent object.
            verticallyOriented: true,   // Determines vertical vs. horizontal orientation
            viewportMargin: 200,        // Pretend tiles +/- 200px away from viewport are in
            zoomLevel: 2                // The initial zoom level (used to store the current zoom level)
        }, options);

        // Returns the page index associated with the given filename; must called after setting settings.manifest
        var getPageIndex = function (filename)
        {
            return getPageIndexForManifest(settings.manifest, filename);
        };

        var getPageIndexForManifest = function (manifest, filename)
        {
            var i,
                np = manifest.pages.length;

            for (i = 0; i < np; i++)
            {
                if (manifest.pages[i].f === filename)
                {
                    return i;
                }
            }

            return -1;
        };

        // Check if a page index is valid
        var isPageValid = function (pageIndex)
        {
            return settings.manifest.isPageValid(pageIndex);
        };

        var reloadViewer = function (newOptions)
        {
            return divaState.viewerCore.reload(newOptions);
        };

        // Called when the change view icon is clicked
        var changeView = function (destinationView)
        {
            switch (destinationView)
            {
                case 'document':
                    return reloadViewer({
                        inGrid: false,
                        inBookLayout: false
                    });

                case 'book':
                    return reloadViewer({
                        inGrid: false,
                        inBookLayout: true
                    });

                case 'grid':
                    return reloadViewer({
                        inGrid: true
                    });

                default:
                    return false;
            }
        };

        //toggles between orientations
        var toggleOrientation = function ()
        {
            var verticallyOriented = !settings.verticallyOriented;

            //if in grid, switch out of grid
            reloadViewer({
                inGrid: false,
                verticallyOriented: verticallyOriented,
                goDirectlyTo: settings.currentPageIndex,
                verticalOffset: divaState.viewerCore.getYOffset(),
                horizontalOffset: divaState.viewerCore.getXOffset()
            });

            return verticallyOriented;
        };

        // Called when the fullscreen icon is clicked
        var toggleFullscreen = function ()
        {
            reloadViewer({
                inFullscreen: !settings.inFullscreen
            });
        };

        var getState = function ()
        {
            var view;

            if (settings.inGrid)
            {
                view = 'g';
            }
            else if (settings.inBookLayout)
            {
                view = 'b';
            }
            else
            {
                view = 'd';
            }

            var pageOffset = viewerState.renderer.getPageToViewportCenterOffset(settings.currentPageIndex);

            var state = {
                'f': settings.inFullscreen,
                'v': view,
                'z': settings.zoomLevel,
                'n': settings.pagesPerRow,
                'i': settings.enableFilename ? settings.manifest.pages[settings.currentPageIndex].f : false,
                'p': settings.enableFilename ? false : settings.currentPageIndex + 1,
                'y': pageOffset ? pageOffset.y : false,
                'x': pageOffset ? pageOffset.x : false
            };

            return state;
        };

        var getLoadOptionsForState = function (state, manifest)
        {
            manifest = manifest || settings.manifest;

            var options = ('v' in state) ? getViewState(state.v) : {};

            if ('f' in state)
                options.inFullscreen = state.f;

            if ('z' in state)
                options.zoomLevel = state.z;

            if ('n' in state)
                options.pagesPerRow = state.n;

            // Only change specify the page if state.i or state.p is valid
            var pageIndex = getPageIndexForManifest(manifest, state.i);

            if (!(pageIndex >= 0 && pageIndex < manifest.pages.length))
            {
                pageIndex = state.p - 1;

                // Possibly NaN
                if (!(pageIndex >= 0 && pageIndex < manifest.pages.length))
                    pageIndex = null;
            }

            if (pageIndex !== null)
            {
                var horizontalOffset = parseInt(state.x, 10);
                var verticalOffset = parseInt(state.y, 10);

                options.goDirectlyTo = pageIndex;
                options.horizontalOffset = horizontalOffset;
                options.verticalOffset = verticalOffset;
            }

            return options;
        };

        var getURLHash = function ()
        {
            var hashParams = getState();
            var hashStringBuilder = [];
            var param;

            for (param in hashParams)
            {
                if (hashParams[param] !== false)
                    hashStringBuilder.push(param + settings.hashParamSuffix + '=' + encodeURIComponent(hashParams[param]));
            }

            return hashStringBuilder.join('&');
        };

        // Returns the URL to the current state of the document viewer (so it should be an exact replica)
        var getCurrentURL = function ()
        {
            return location.protocol + '//' + location.host + location.pathname + location.search + '#' + getURLHash();
        };

        var getViewState = function(view)
        {
            switch (view)
            {
                case 'd':
                    return {
                        inGrid: false,
                        inBookLayout: false
                    };

                case 'b':
                    return {
                        inGrid: false,
                        inBookLayout: true
                    };

                case 'g':
                    return {
                        inGrid: true,
                        inBookLayout: false
                    };

                default:
                    return null;
            }
        };

        var showError = function(message)
        {
            divaState.viewerCore.showError(message);
        };

        var ajaxError = function(jqxhr, status, error)
        {
            // Show a basic error message within the document viewer pane
            // FIXME: Make this more end-user friendly. What about 404's etc?

            var errorMessage = ['Invalid objectData setting. Error code: ' + jqxhr.status + ' ' + error];

            // Detect and handle CORS errors
            var dataHasAbsolutePath = settings.objectData.lastIndexOf('http', 0) === 0;

            if (dataHasAbsolutePath && error === '')
            {
                var jsonHost = settings.objectData.replace(/https?:\/\//i, "").split(/[/?#]/)[0];

                if (location.hostname !== jsonHost)
                {
                    errorMessage.push(
                        elt('p', 'Attempted to access cross-origin data without CORS.'),
                        elt('p',
                            'You may need to update your server configuration to support CORS. For help, see the ',
                            elt('a', {
                                href: 'https://github.com/DDMAL/diva.js/wiki/Installation#a-note-about-cross-site-requests',
                                target: '_blank'
                            }, 'cross-site request documentation.')
                        )
                    );
                }
            }

            showError(errorMessage);
        };

        var loadObjectData = function (responseData, hashState)
        {
            var isIIIF, manifest;

            // parse IIIF manifest if it is an IIIF manifest. TODO improve IIIF detection method
            if (responseData.hasOwnProperty('@context') && (responseData['@context'].indexOf('iiif') !== -1 ||
                responseData['@context'].indexOf('shared-canvas') !== -1))
            {
                isIIIF = true;

                // trigger ManifestDidLoad event
                // FIXME: Why is this triggered before the manifest is parsed?
                diva.Events.publish('ManifestDidLoad', [responseData], self);

                manifest = ImageManifest.fromIIIF(responseData);
            }
            else
            {
                isIIIF = false;
                manifest = ImageManifest.fromLegacyManifest(responseData, {
                    iipServerURL: settings.iipServerURL,
                    imageDir: settings.imageDir
                });
            }

            var loadOptions = hashState ? getLoadOptionsForState(hashState, manifest) : {};

            divaState.viewerCore.setManifest(manifest, isIIIF, loadOptions);
        };

        /** Parse the hash parameters into the format used by getState and setState */
        var getHashParamState = function ()
        {
            var state = {};

            ['f', 'v', 'z', 'n', 'i', 'p', 'y', 'x'].forEach(function (param)
            {
                var value = HashParams.get(param + settings.hashParamSuffix);

                // `false` is returned if the value is missing
                if (value !== false)
                    state[param] = value;
            });

            // Do some awkward special-casing, since this format is kind of weird.

            // For inFullscreen (f), true and false strings should be interpreted
            // as booleans.
            if (state.f === 'true')
                state.f = true;
            else if (state.f === 'false')
                state.f = false;

            // Convert numerical values to integers, if provided
            ['z', 'n', 'p', 'x', 'y'].forEach(function (param)
            {
                if (param in state)
                    state[param] = parseInt(state[param], 10);
            });

            return state;
        };

        var checkLoaded = function()
        {
            if (!viewerState.loaded)
            {
                console.warn("The viewer is not completely initialized. This is likely because it is still downloading data. To fix this, only call this function if the isReady() method returns true.");
                return false;
            }
            return true;
        };

        var init = function ()
        {
            var viewerCore = new ViewerCore(element, options, self);

            viewerState = viewerCore.getInternalState();
            settings = viewerCore.getSettings();

            divaState = {
                viewerCore: viewerCore,
                toolbar: settings.enableToolbar ? createToolbar(self) : null
            };

            var hashState = getHashParamState();

            if (typeof settings.objectData === 'object')
            {
                // Defer execution until initialization has completed
                setTimeout(function ()
                {
                    loadObjectData(settings.objectData, hashState);
                }, 0);
            }
            else
            {
                $.ajax({
                    url: settings.objectData,
                    cache: true,
                    dataType: 'json',
                    error: ajaxError,
                    success: function (responseData)
                    {
                        loadObjectData(responseData, hashState);
                    }
                });
            }
        };

        /* PUBLIC FUNCTIONS
        ===============================================
        */

        // Returns the title of the document, based on the directory name
        this.getItemTitle = function ()
        {
            return settings.manifest.itemTitle;
        };

        // Go to a particular page by its page number (with indexing starting at 1)
            //xAnchor may either be "left", "right", or default "center"; the (xAnchor) side of the page will be anchored to the (xAnchor) side of the diva-outer element
            //yAnchor may either be "top", "bottom", or default "center"; same process as xAnchor.
        // returns True if the page number passed is valid; false if it is not.
        this.gotoPageByNumber = function (pageNumber, xAnchor, yAnchor)
        {
            var pageIndex = parseInt(pageNumber, 10) - 1;
            return this.gotoPageByIndex(pageIndex, xAnchor, yAnchor);
        };

        // Go to a particular page (with indexing starting at 0)
            //xAnchor may either be "left", "right", or default "center"; the (xAnchor) side of the page will be anchored to the (xAnchor) side of the diva-outer element
            //yAnchor may either be "top", "bottom", or default "center"; same process as xAnchor.
        // returns True if the page index is valid; false if it is not.
        this.gotoPageByIndex = function (pageIndex, xAnchor, yAnchor)
        {
            pageIndex = parseInt(pageIndex, 10);
            if (isPageValid(pageIndex))
            {
                var xOffset = divaState.viewerCore.getXOffset(pageIndex, xAnchor);
                var yOffset = divaState.viewerCore.getYOffset(pageIndex, yAnchor);

                viewerState.renderer.goto(pageIndex, xOffset, yOffset);
                return true;
            }
            return false;
        };

        this.getNumberOfPages = function ()
        {
            if (!checkLoaded())
                return false;

            return settings.numPages;
        };

        // Returns the dimensions of a given page index at a given zoom level
        this.getPageDimensionsAtZoomLevel = function (pageIdx, zoomLevel)
        {
            if (!checkLoaded())
                return false;

            if (zoomLevel > settings.maxZoomLevel)
                zoomLevel = settings.maxZoomLevel;

            var pg = settings.manifest.pages[parseInt(pageIdx, 10)];
            var pgAtZoom = pg.d[parseInt(zoomLevel, 10)];
            return {'width': pgAtZoom.w, 'height': pgAtZoom.h};
        };

        // Returns the dimensions of the current page at the current zoom level
        this.getCurrentPageDimensionsAtCurrentZoomLevel = function ()
        {
            return this.getPageDimensionsAtZoomLevel(settings.currentPageIndex, settings.zoomLevel);
        };

        this.isReady = function ()
        {
            return viewerState.loaded;
        };

        this.getCurrentPageIndex = function ()
        {
            return settings.currentPageIndex;
        };

        this.getCurrentPageFilename = function ()
        {
            return settings.manifest.pages[settings.currentPageIndex].f;
        };

        this.getCurrentPageNumber = function ()
        {
            return settings.currentPageIndex + 1;
        };

        // Returns an array of all filenames in the document
        this.getFilenames = function ()
        {
            var filenames = [];

            for (var i = 0; i < settings.numPages; i++)
            {
                filenames[i] = settings.manifest.pages[i].f;
            }

            return filenames;
        };

        // Returns the current zoom level
        this.getZoomLevel = function ()
        {
            return settings.zoomLevel;
        };

        // gets the maximum zoom level for the entire document
        this.getMaxZoomLevel = function ()
        {
            return settings.maxZoomLevel;
        };

        // gets the max zoom level for a given page
        this.getMaxZoomLevelForPage = function (pageIdx)
        {
            if (!checkLoaded)
                return false;

            return settings.manifest.pages[pageIdx].m;
        };

        this.getMinZoomLevel = function ()
        {
            return settings.minZoomLevel;
        };

        // Use the provided zoom level (will check for validity first)
        // Returns false if the zoom level is invalid, true otherwise
        this.setZoomLevel = function (zoomLevel)
        {
            if (settings.inGrid)
            {
                reloadViewer({
                    inGrid: false
                });
            }

            return divaState.viewerCore.zoom(zoomLevel);
        };

        this.getGridPagesPerRow = function ()
        {
            // TODO(wabain): Add test case
            return this.pagesPerRow;
        };

        this.setGridPagesPerRow = function (newValue)
        {
            // TODO(wabain): Add test case
            if (!divaState.viewerCore.isValidOption('pagesPerRow', newValue))
                return false;

            return reloadViewer({
                inGrid: true,
                pagesPerRow: newValue
            });
        };

        // Zoom in. Will return false if it's at the maximum zoom
        this.zoomIn = function ()
        {
            return this.setZoomLevel(settings.zoomLevel + 1);
        };

        // Zoom out. Will return false if it's at the minimum zoom
        this.zoomOut = function ()
        {
            return this.setZoomLevel(settings.zoomLevel - 1);
        };

        // Check if something (e.g. a highlight box on a particular page) is visible
        this.inViewport = function (pageNumber, leftOffset, topOffset, width, height)
        {
            if (!viewerState.renderer)
                return false;

            var offset = viewerState.renderer.getPageOffset(pageNumber - 1);

            var top = offset.top + topOffset;
            var left = offset.left + leftOffset;

            return viewerState.viewport.intersectsRegion({
                top: top,
                bottom: top + height,
                left: left,
                right: left + width
            });
        };

        //Public wrapper for isPageVisible
        //Determines if a page is currently in the viewport
        this.isPageInViewport = function (pageIndex)
        {
            return viewerState.renderer.isPageVisible(pageIndex);
        };

        //Public wrapper for isPageLoaded
        //Determines if a page is currently in the DOM
        this.isPageLoaded = function (pageIndex)
        {
            if (!viewerState.renderer)
                return false;

            return viewerState.renderer.isPageLoaded(pageIndex);
        };

        // Toggle fullscreen mode
        this.toggleFullscreenMode = function ()
        {
            toggleFullscreen();
        };

        // Close toolbar popups
        this.closePopups = function ()
        {
            divaState.toolbar.closePopups();
        };

        // Enter fullscreen mode if currently not in fullscreen mode
        // Returns false if in fullscreen mode initially, true otherwise
        // This function will work even if enableFullscreen is set to false
        this.enterFullscreenMode = function ()
        {
            if (!settings.inFullscreen)
            {
                toggleFullscreen();
                return true;
            }

            return false;
        };

        // Leave fullscreen mode if currently in fullscreen mode
        // Returns true if in fullscreen mode intitially, false otherwise
        this.leaveFullscreenMode = function ()
        {
            if (settings.inFullscreen)
            {
                toggleFullscreen();
                return true;
            }

            return false;
        };

        // Change views. Takes 'document', 'book', or 'grid' to specify which view to switch into
        this.changeView = function(destinationView)
        {
            return changeView(destinationView);
        };

        // Enter grid view if currently not in grid view
        // Returns false if in grid view initially, true otherwise
        this.enterGridView = function ()
        {
            if (!settings.inGrid)
            {
                changeView('grid');
                return true;
            }

            return false;
        };

        // Leave grid view if currently in grid view
        // Returns true if in grid view initially, false otherwise
        this.leaveGridView = function ()
        {
            if (settings.inGrid)
            {
                reloadViewer({ inGrid: false });
                return true;
            }

            return false;
        };

        // Jump to a page based on its filename
        // Returns true if successful and false if the filename is invalid
        this.gotoPageByName = function (filename, xAnchor, yAnchor)
        {
            var pageIndex = getPageIndex(filename);
            return this.gotoPageByIndex(pageIndex, xAnchor, yAnchor);
        };

        // Get the page index (0-based) corresponding to a given filename
        // If the page index doesn't exist, this will return -1
        this.getPageIndex = function (filename)
        {
            return getPageIndex(filename);
        };

        // Get the current URL (exposes the private method)
        this.getCurrentURL = function ()
        {
            return getCurrentURL();
        };

        // Get the hash part only of the current URL (without the leading #)
        this.getURLHash = function ()
        {
            return getURLHash();
        };

        // Get an object representing the state of this diva instance (for setState)
        this.getState = function ()
        {
            return getState();
        };

        // Align this diva instance with a state object (as returned by getState)
        this.setState = function (state)
        {
            reloadViewer(getLoadOptionsForState(state));
        };

        // Get the instance selector for this instance, since it's auto-generated.
        this.getInstanceSelector = function ()
        {
            return settings.selector;
        };

        // Get the instance ID -- essentially the selector without the leading '#'.
        this.getInstanceId = function ()
        {
            return settings.ID;
        };

        this.getSettings = function ()
        {
            return settings;
        };

        /*
            Translates a measurement from the zoom level on the largest size
            to one on the current zoom level.

            For example, a point 1000 on an image that is on zoom level 2 of 5
            translates to a position of 111.111... (1000 / (5 - 2)^2).

            Works for a single pixel co-ordinate or a dimension (e.g., translates a box
            that is 1000 pixels wide on the original to one that is 111.111 pixels wide
            on the current zoom level).
        */
        this.translateFromMaxZoomLevel = function (position)
        {
            var zoomDifference = settings.maxZoomLevel - settings.zoomLevel;
            return position / Math.pow(2, zoomDifference);
        };

        /*
            Translates a measurement from the current zoom level to the position on the
            largest zoom level.

            Works for a single pixel co-ordinate or a dimension (e.g., translates a box
            that is 111.111 pixels wide on the current image to one that is 1000 pixels wide
            on the current zoom level).
        */
        this.translateToMaxZoomLevel = function (position)
        {
            var zoomDifference = settings.maxZoomLevel - settings.zoomLevel;

            // if there is no difference, it's a box on the max zoom level and
            // we can just return the position.
            if (zoomDifference === 0)
                return position;

            return position * Math.pow(2, zoomDifference);
        };

        // Re-enables document dragging, scrolling (by keyboard if set), and zooming by double-clicking
        this.enableScrollable = function()
        {
            divaState.viewerCore.enableScrollable();
        };

        // Disables document dragging, scrolling (by keyboard if set), and zooming by double-clicking
        this.disableScrollable = function ()
        {
            divaState.viewerCore.disableScrollable();
        };

        //Changes between horizontal layout and vertical layout. Returns true if document is now vertically oriented, false otherwise.
        this.toggleOrientation = function ()
        {
            return toggleOrientation();
        };

        //Returns distance between the northwest corners of diva-inner and page index
        this.getPageOffset = function(pageIndex)
        {
            if (!viewerState.renderer)
                return null;

            return viewerState.renderer.getPageOffset(pageIndex);
        };

        //shortcut to getPageOffset for current page
        this.getCurrentPageOffset = function()
        {
            return this.getPageOffset(settings.currentPageIndex);
        };

        //Returns the page position and size (ulx, uly, h, w properties) of page pageIndex when there are pagesPerRow pages per row
        //TODO: calculate all grid height levels and store them so this can be AtGridLevel(pageIndex, pagesPerRow) ?
        this.getPageDimensionsAtCurrentGridLevel = function(pageIndex)
        {
            // FIXME(wabain): This is a breaking change from 4.x to 5. Is this change desirable
            // behaviour?
            if (!settings.inGrid)
                throw new Error('Cannot get grid-based dimensions when not in grid view');

            pageIndex = isPageValid(pageIndex) ? pageIndex : settings.currentPageIndex;

            return viewerState.renderer.getPageDimensions(pageIndex);
        };

        /*
            Given a pageX and pageY value (as could be retreived from a jQuery event object),
                returns either the page visible at that (x,y) position or "false" if no page is.
        */
        this.getPageIndexForPageXYValues = function(pageX, pageY)
        {
            //get the four edges of the outer element
            var outerOffset = viewerState.outerElement.getBoundingClientRect();
            var outerTop = outerOffset.top;
            var outerLeft = outerOffset.left;
            var outerBottom = outerOffset.bottom;
            var outerRight = outerOffset.right;

            //if the clicked position was outside the diva-outer object, it was not on a visible portion of a page
            if (pageX < outerLeft || pageX > outerRight)
                return false;

            if (pageY < outerTop || pageY > outerBottom)
                return false;

            //navigate through all diva page objects
            var pages = document.getElementsByClassName('diva-page');
            var curPageIdx = pages.length;
            while (curPageIdx--)
            {
                //get the offset for each page
                var curPage = pages[curPageIdx];
                var curOffset = curPage.getBoundingClientRect();

                //if this point is outside the horizontal boundaries of the page, continue
                if (pageX < curOffset.left || pageX > curOffset.right)
                    continue;

                //same with vertical boundaries
                if (pageY < curOffset.top || pageY > curOffset.bottom)
                    continue;

                //if we made it through the above two, we found the page we're looking for
                return curPage.getAttribute('data-index');
            }

            //if we made it through that entire while loop, we didn't click on a page
            return false;
        };

        /**
         * Returns a URL for the image of the page at the given index. The
         * optional size parameter supports setting the image width or height
         * (default is full-sized).
         */
        this.getPageImageURL = function (pageIndex, size)
        {
            return settings.manifest.getPageImageURL(pageIndex, size);
        };

        //Pretty self-explanatory.
        this.isVerticallyOriented = function()
        {
            return settings.verticallyOriented;
        };

        this.changeObject = function(objectData)
        {
            viewerState.loaded = false;
            divaState.viewerCore.clear();

            if (viewerState.renderer)
                viewerState.renderer.destroy();

            viewerState.options.objectData = objectData;

            if (typeof objectData === 'object')
            {
                setTimeout(function ()
                {
                    loadObjectData(objectData);
                });

                return;
            }

            viewerState.throbberTimeoutID = setTimeout(function ()
            {
                $(settings.selector + 'throbber').show();
            }, settings.throbberTimeout);

            $.ajax({
                url: settings.objectData,
                cache: true,
                dataType: 'json',
                error: ajaxError,
                success: function (responseData)
                {
                    loadObjectData(responseData);
                }
            });
        };

        this.activate = function ()
        {
            viewerState.isActiveDiva = true;
        };

        this.deactivate = function ()
        {
            viewerState.isActiveDiva = false;
        };

        // Destroys this instance, tells plugins to do the same (for testing)
        this.destroy = function ()
        {
            divaState.viewerCore.destroy();
        };

        // Call the init function when this object is created.
        init();
    };

    $.fn.diva = function (options)
    {
        return this.each(function ()
        {
            var divaParent = $(this);

            // Return early if this element already has a plugin instance
            if (divaParent.data('diva'))
                return;

            // Otherwise, instantiate the document viewer
            var diva = new Diva(this, options);
            divaParent.data('diva', diva);
        });
    };
})(jQuery);
