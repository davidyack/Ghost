define("ghost/adapters/application", 
  ["ghost/utils/ghost-paths","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ghostPaths = __dependency1__["default"];

    
    var ApplicationAdapter = DS.RESTAdapter.extend({
        host: window.location.origin,
        namespace: ghostPaths().apiRoot.slice(1),
    
        findQuery: function (store, type, query) {
            var id;
    
            if (query.id) {
                id = query.id;
                delete query.id;
            }
    
            return this.ajax(this.buildURL(type.typeKey, id), 'GET', {data: query});
        },
    
        buildURL: function (type, id) {
            // Ensure trailing slashes
            var url = this._super(type, id);
    
            if (url.slice(-1) !== '/') {
                url += '/';
            }
    
            return url;
        },
    
        // Override deleteRecord to disregard the response body on 2xx responses.
        // This is currently needed because the API is returning status 200 along
        // with the JSON object for the deleted entity and Ember expects an empty
        // response body for successful DELETEs.
        // Non-2xx (failure) responses will still work correctly as Ember will turn
        // them into rejected promises.
        deleteRecord: function () {
            var response = this._super.apply(this, arguments);
    
            return response.then(function () {
                return null;
            });
        }
    });
    
    __exports__["default"] = ApplicationAdapter;
  });
define("ghost/adapters/embedded-relation-adapter", 
  ["ghost/adapters/application","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ApplicationAdapter = __dependency1__["default"];

    
    // EmbeddedRelationAdapter will augment the query object in calls made to
    // DS.Store#find, findQuery, and findAll with the correct "includes"
    // (?include=relatedType) by introspecting on the provided subclass of the DS.Model.
    //
    // Example:
    // If a model has an embedded hasMany relation, the related type will be included:
    // roles: DS.hasMany('role', { embedded: 'always' }) => ?include=roles
    
    var EmbeddedRelationAdapter = ApplicationAdapter.extend({
        find: function (store, type, id) {
            return this.findQuery(store, type, this.buildQuery(store, type, id));
        },
    
        findQuery: function (store, type, query) {
            return this._super(store, type, this.buildQuery(store, type, query));
        },
    
        findAll: function (store, type, sinceToken) {
            return this.findQuery(store, type, this.buildQuery(store, type, sinceToken));
        },
    
        buildQuery: function (store, type, options) {
            var model,
                toInclude = [],
                query = {},
                deDupe = {};
    
            // Get the class responsible for creating records of this type
            model = store.modelFor(type);
    
            // Iterate through the model's relationships and build a list
            // of those that need to be pulled in via "include" from the API
            model.eachRelationship(function (name, meta) {
                if (meta.kind === 'hasMany' &&
                    Object.prototype.hasOwnProperty.call(meta.options, 'embedded') &&
                    meta.options.embedded === 'always') {
                    toInclude.push(name);
                }
            });
    
            if (toInclude.length) {
                // If this is a find by id, build a query object and attach the includes
                if (typeof options === 'string' || typeof options === 'number') {
                    query.id = options;
                    query.include = toInclude.join(',');
                } else if (typeof options === 'object' || Ember.isNone(options)) {
                    // If this is a find all (no existing query object) build one and attach
                    // the includes.
                    // If this is a find with an existing query object then merge the includes
                    // into the existing object. Existing properties and includes are preserved.
                    query = options || query;
                    toInclude = toInclude.concat(query.include ? query.include.split(',') : []);
    
                    toInclude.forEach(function (include) {
                        deDupe[include] = true;
                    });
    
                    query.include = Object.keys(deDupe).join(',');
                }
            }
    
            return query;
        }
    });
    
    __exports__["default"] = EmbeddedRelationAdapter;
  });
define("ghost/adapters/post", 
  ["ghost/adapters/embedded-relation-adapter","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EmbeddedRelationAdapter = __dependency1__["default"];

    
    var PostAdapter = EmbeddedRelationAdapter.extend({
        createRecord: function (store, type, record) {
            var data = {},
                serializer = store.serializerFor(type.typeKey),
                url = this.buildURL(type.typeKey);
    
            // make the server return with the tags embedded
            url = url + '?include=tags';
    
            // use the PostSerializer to transform the model back into
            // an array with a post object like the API expects
            serializer.serializeIntoHash(data, type, record);
    
            return this.ajax(url, 'POST', {data: data});
        },
    
        updateRecord: function (store, type, record) {
            var data = {},
                serializer = store.serializerFor(type.typeKey),
                id = Ember.get(record, 'id'),
                url = this.buildURL(type.typeKey, id);
    
            // make the server return with the tags embedded
            url = url + '?include=tags';
    
            // use the PostSerializer to transform the model back into
            // an array of posts objects like the API expects
            serializer.serializeIntoHash(data, type, record);
    
            // use the ApplicationAdapter's buildURL method
            return this.ajax(url, 'PUT', {data: data});
        }
    });
    
    __exports__["default"] = PostAdapter;
  });
define("ghost/adapters/setting", 
  ["ghost/adapters/application","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ApplicationAdapter = __dependency1__["default"];

    
    var SettingAdapter = ApplicationAdapter.extend({
        updateRecord: function (store, type, record) {
            var data = {},
                serializer = store.serializerFor(type.typeKey);
    
            // remove the fake id that we added onto the model.
            delete record.id;
    
            // use the SettingSerializer to transform the model back into
            // an array of settings objects like the API expects
            serializer.serializeIntoHash(data, type, record);
    
            // use the ApplicationAdapter's buildURL method but do not
            // pass in an id.
            return this.ajax(this.buildURL(type.typeKey), 'PUT', {data: data});
        }
    });
    
    __exports__["default"] = SettingAdapter;
  });
define("ghost/adapters/user", 
  ["ghost/adapters/embedded-relation-adapter","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EmbeddedRelationAdapter = __dependency1__["default"];

    
    var UserAdapter = EmbeddedRelationAdapter.extend({
        createRecord: function (store, type, record) {
            var data = {},
                serializer = store.serializerFor(type.typeKey),
                url = this.buildURL(type.typeKey);
    
            // Ask the API to include full role objects in its response
            url += '?include=roles';
    
            // Use the UserSerializer to transform the model back into
            // an array of user objects like the API expects
            serializer.serializeIntoHash(data, type, record);
    
            // Use the url from the ApplicationAdapter's buildURL method
            return this.ajax(url, 'POST', {data: data});
        },
    
        updateRecord: function (store, type, record) {
            var data = {},
                serializer = store.serializerFor(type.typeKey),
                id = Ember.get(record, 'id'),
                url = this.buildURL(type.typeKey, id);
    
            // Ask the API to include full role objects in its response
            url += '?include=roles';
    
            // Use the UserSerializer to transform the model back into
            // an array of user objects like the API expects
            serializer.serializeIntoHash(data, type, record);
    
            // Use the url from the ApplicationAdapter's buildURL method
            return this.ajax(url, 'PUT', {data: data});
        },
    
        find: function (store, type, id) {
            var url = this.buildQuery(store, type, id);
            url.status = 'all';
            return this.findQuery(store, type, url);
        }
    });
    
    __exports__["default"] = UserAdapter;
  });
define("ghost/app", 
  ["ember/resolver","ember/load-initializers","ghost/utils/link-view","ghost/utils/text-field","ghost/config","ghost/helpers/ghost-paths","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
    "use strict";
    var Resolver = __dependency1__["default"];

    var loadInitializers = __dependency2__["default"];



    var configureApp = __dependency5__["default"];

    var ghostPathsHelper = __dependency6__["default"];

    
    Ember.MODEL_FACTORY_INJECTIONS = true;
    
    var App = Ember.Application.extend({
        modulePrefix: 'ghost',
        Resolver: Resolver['default']
    });
    
    // Runtime configuration of Ember.Application
    configureApp(App);
    
    loadInitializers(App, 'ghost');
    
    Ember.Handlebars.registerHelper('gh-path', ghostPathsHelper);
    
    __exports__["default"] = App;
  });
define("ghost/assets/lib/touch-editor", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var createTouchEditor = function createTouchEditor() {
        var noop = function () {},
            TouchEditor;
    
        TouchEditor = function (el, options) {
            /*jshint unused:false*/
            this.textarea = el;
            this.win = {document: this.textarea};
            this.ready = true;
            this.wrapping = document.createElement('div');
    
            var textareaParent = this.textarea.parentNode;
    
            this.wrapping.appendChild(this.textarea);
            textareaParent.appendChild(this.wrapping);
    
            this.textarea.style.opacity = 1;
        };
    
        TouchEditor.prototype = {
            setOption: function (type, handler) {
                if (type === 'onChange') {
                    $(this.textarea).change(handler);
                }
            },
            eachLine: function () {
                return [];
            },
            getValue: function () {
                return this.textarea.value;
            },
            setValue: function (code) {
                this.textarea.value = code;
            },
            focus: noop,
            getCursor: function () {
                return {line: 0, ch: 0};
            },
            setCursor: noop,
            currentLine: function () {
                return 0;
            },
            cursorPosition: function () {
                return {character: 0};
            },
            addMarkdown: noop,
            nthLine: noop,
            refresh: noop,
            selectLines: noop,
            on: noop,
            off: noop
        };
    
        return TouchEditor;
    };
    
    __exports__["default"] = createTouchEditor;
  });
define("ghost/assets/lib/uploader", 
  ["ghost/utils/ghost-paths","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ghostPaths = __dependency1__["default"];

    
    var UploadUi,
        upload,
        Ghost = ghostPaths();
    
    UploadUi = function ($dropzone, settings) {
        var $url = '<div class="js-url"><input class="url js-upload-url" type="url" placeholder="http://"/></div>',
            $cancel = '<a class="image-cancel js-cancel" title="Delete"><span class="hidden">Delete</span></a>',
            $progress =  $('<div />', {
                class: 'js-upload-progress progress progress-success active',
                role: 'progressbar',
                'aria-valuemin': '0',
                'aria-valuemax': '100'
            }).append($('<div />', {
                class: 'js-upload-progress-bar bar',
                style: 'width:0%'
            }));
    
        $.extend(this, {
            complete: function (result) {
                var self = this;
    
                function showImage(width, height) {
                    $dropzone.find('img.js-upload-target').attr({width: width, height: height}).css({display: 'block'});
                    $dropzone.find('.fileupload-loading').remove();
                    $dropzone.css({height: 'auto'});
                    $dropzone.delay(250).animate({opacity: 100}, 1000, function () {
                        $('.js-button-accept').prop('disabled', false);
                        self.init();
                    });
                }
    
                function animateDropzone($img) {
                    $dropzone.animate({opacity: 0}, 250, function () {
                        $dropzone.removeClass('image-uploader').addClass('pre-image-uploader');
                        $dropzone.css({minHeight: 0});
                        self.removeExtras();
                        $dropzone.animate({height: $img.height()}, 250, function () {
                            showImage($img.width(), $img.height());
                        });
                    });
                }
    
                function preLoadImage() {
                    var $img = $dropzone.find('img.js-upload-target')
                        .attr({src: '', width: 'auto', height: 'auto'});
    
                    $progress.animate({opacity: 0}, 250, function () {
                        $dropzone.find('span.media').after('<img class="fileupload-loading"  src="' + Ghost.subdir + '/ghost/img/loadingcat.gif" />');
                        if (!settings.editor) {$progress.find('.fileupload-loading').css({top: '56px'}); }
                    });
                    $dropzone.trigger('uploadsuccess', [result]);
                    $img.one('load', function () {
                        animateDropzone($img);
                    }).attr('src', result);
                }
                preLoadImage();
            },
    
            bindFileUpload: function () {
                var self = this;
    
                $dropzone.find('.js-fileupload').fileupload().fileupload('option', {
                    url: Ghost.apiRoot + '/uploads/',
                    add: function (e, data) {
                        /*jshint unused:false*/
                        $('.js-button-accept').prop('disabled', true);
                        $dropzone.find('.js-fileupload').removeClass('right');
                        $dropzone.find('.js-url').remove();
                        $progress.find('.js-upload-progress-bar').removeClass('fail');
                        $dropzone.trigger('uploadstart', [$dropzone.attr('id')]);
                        $dropzone.find('span.media, div.description, a.image-url, a.image-webcam')
                            .animate({opacity: 0}, 250, function () {
                                $dropzone.find('div.description').hide().css({opacity: 100});
                                if (settings.progressbar) {
                                    $dropzone.find('div.js-fail').after($progress);
                                    $progress.animate({opacity: 100}, 250);
                                }
                                data.submit();
                            });
                    },
                    dropZone: settings.fileStorage ? $dropzone : null,
                    progressall: function (e, data) {
                        /*jshint unused:false*/
                        var progress = parseInt(data.loaded / data.total * 100, 10);
                        if (!settings.editor) {$progress.find('div.js-progress').css({position: 'absolute', top: '40px'}); }
                        if (settings.progressbar) {
                            $dropzone.trigger('uploadprogress', [progress, data]);
                            $progress.find('.js-upload-progress-bar').css('width', progress + '%');
                        }
                    },
                    fail: function (e, data) {
                        /*jshint unused:false*/
                        $('.js-button-accept').prop('disabled', false);
                        $dropzone.trigger('uploadfailure', [data.result]);
                        $dropzone.find('.js-upload-progress-bar').addClass('fail');
                        if (data.jqXHR.status === 413) {
                            $dropzone.find('div.js-fail').text('The image you uploaded was larger than the maximum file size your server allows.');
                        } else if (data.jqXHR.status === 415) {
                            $dropzone.find('div.js-fail').text('The image type you uploaded is not supported. Please use .PNG, .JPG, .GIF, .SVG.');
                        } else {
                            $dropzone.find('div.js-fail').text('Something went wrong :(');
                        }
                        $dropzone.find('div.js-fail, button.js-fail').fadeIn(1500);
                        $dropzone.find('button.js-fail').on('click', function () {
                            $dropzone.css({minHeight: 0});
                            $dropzone.find('div.description').show();
                            self.removeExtras();
                            self.init();
                        });
                    },
                    done: function (e, data) {
                        /*jshint unused:false*/
                        self.complete(data.result);
                    }
                });
            },
    
            buildExtras: function () {
                if (!$dropzone.find('span.media')[0]) {
                    $dropzone.prepend('<span class="media"><span class="hidden">Image Upload</span></span>');
                }
                if (!$dropzone.find('div.description')[0]) {
                    $dropzone.append('<div class="description">Add image</div>');
                }
                if (!$dropzone.find('div.js-fail')[0]) {
                    $dropzone.append('<div class="js-fail failed" style="display: none">Something went wrong :(</div>');
                }
                if (!$dropzone.find('button.js-fail')[0]) {
                    $dropzone.append('<button class="js-fail btn btn-green" style="display: none">Try Again</button>');
                }
                if (!$dropzone.find('a.image-url')[0]) {
                    $dropzone.append('<a class="image-url" title="Add image from URL"><span class="hidden">URL</span></a>');
                }
               // if (!$dropzone.find('a.image-webcam')[0]) {
               //     $dropzone.append('<a class="image-webcam" title="Add image from webcam"><span class="hidden">Webcam</span></a>');
               // }
            },
    
            removeExtras: function () {
                $dropzone.find('span.media, div.js-upload-progress, a.image-url, a.image-upload, a.image-webcam, div.js-fail, button.js-fail, a.js-cancel').remove();
            },
    
            initWithDropzone: function () {
                var self = this;
    
                // This is the start point if no image exists
                $dropzone.find('img.js-upload-target').css({display: 'none'});
                $dropzone.find('div.description').show();
                $dropzone.removeClass('pre-image-uploader image-uploader-url').addClass('image-uploader');
                this.removeExtras();
                this.buildExtras();
                this.bindFileUpload();
                if (!settings.fileStorage) {
                    self.initUrl();
                    return;
                }
                $dropzone.find('a.image-url').on('click', function () {
                    self.initUrl();
                });
            },
            initUrl: function () {
                var self = this, val;
                this.removeExtras();
                $dropzone.addClass('image-uploader-url').removeClass('pre-image-uploader');
                $dropzone.find('.js-fileupload').addClass('right');
                if (settings.fileStorage) {
                    $dropzone.append($cancel);
                }
                $dropzone.find('.js-cancel').on('click', function () {
                    $dropzone.find('.js-url').remove();
                    $dropzone.find('.js-fileupload').removeClass('right');
                    $dropzone.trigger('imagecleared');
                    self.removeExtras();
                    self.initWithDropzone();
                });
    
                $dropzone.find('div.description').before($url);
    
                if (settings.editor) {
                    $dropzone.find('div.js-url').append('<button class="btn btn-blue js-button-accept">Save</button>');
                }
    
                $dropzone.find('.js-button-accept').on('click', function () {
                    val = $dropzone.find('.js-upload-url').val();
                    $dropzone.find('div.description').hide();
                    $dropzone.find('.js-fileupload').removeClass('right');
                    $dropzone.find('.js-url').remove();
                    if (val === '') {
                        $dropzone.trigger('uploadsuccess', 'http://');
                        self.initWithDropzone();
                    } else {
                        self.complete(val);
                    }
                });
    
                // Only show the toggle icon if there is a dropzone mode to go back to
                if (settings.fileStorage !== false) {
                    $dropzone.append('<a class="image-upload" title="Add image"><span class="hidden">Upload</span></a>');
                }
    
                $dropzone.find('a.image-upload').on('click', function () {
                    $dropzone.find('.js-url').remove();
                    $dropzone.find('.js-fileupload').removeClass('right');
                    self.initWithDropzone();
                });
            },
    
            initWithImage: function () {
                var self = this;
    
                // This is the start point if an image already exists
                $dropzone.removeClass('image-uploader image-uploader-url').addClass('pre-image-uploader');
                $dropzone.find('div.description').hide();
                $dropzone.find('img.js-upload-target').show();
                $dropzone.append($cancel);
                $dropzone.find('.js-cancel').on('click', function () {
                    $dropzone.find('img.js-upload-target').attr({src: ''});
                    $dropzone.find('div.description').show();
                    $dropzone.trigger('imagecleared');
                    $dropzone.delay(2500).animate({opacity: 100}, 1000, function () {
                        self.init();
                    });
    
                    $dropzone.trigger('uploadsuccess', 'http://');
                    self.initWithDropzone();
                });
            },
    
            init: function () {
                var imageTarget = $dropzone.find('img.js-upload-target');
                // First check if field image is defined by checking for js-upload-target class
                if (!imageTarget[0]) {
                    // This ensures there is an image we can hook into to display uploaded image
                    $dropzone.prepend('<img class="js-upload-target" style="display: none"  src="" />');
                }
                $('.js-button-accept').prop('disabled', false);
                if (imageTarget.attr('src') === '' || imageTarget.attr('src') === undefined) {
                    this.initWithDropzone();
                } else {
                    this.initWithImage();
                }
            },
    
            reset: function () {
                $dropzone.find('.js-url').remove();
                $dropzone.find('.js-fileupload').removeClass('right');
                this.removeExtras();
                this.initWithDropzone();
            }
        });
    };
    
    upload = function (options) {
        var settings = $.extend({
            progressbar: true,
            editor: false,
            fileStorage: true
        }, options);
    
        return this.each(function () {
            var $dropzone = $(this),
                ui;
    
            ui = new UploadUi($dropzone, settings);
            this.uploaderUi = ui;
            ui.init();
        });
    };
    
    __exports__["default"] = upload;
  });
define("ghost/components/gh-activating-list-item", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ActivatingListItem = Ember.Component.extend({
        tagName: 'li',
        classNameBindings: ['active'],
        active: false,
    
        unfocusLink: function () {
            this.$('a').blur();
        }.on('click')
    });
    
    __exports__["default"] = ActivatingListItem;
  });
define("ghost/components/gh-codemirror", 
  ["ghost/mixins/marker-manager","ghost/utils/codemirror-mobile","ghost/utils/set-scroll-classname","ghost/utils/codemirror-shortcuts","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    /*global CodeMirror */
    
    var MarkerManager = __dependency1__["default"];

    var mobileCodeMirror = __dependency2__["default"];

    var setScrollClassName = __dependency3__["default"];

    var codeMirrorShortcuts = __dependency4__["default"];

    
    var onChangeHandler,
        onScrollHandler,
        Codemirror;
    
    codeMirrorShortcuts.init();
    
    onChangeHandler = function (cm, changeObj) {
        var line,
            component = cm.component;
    
        // fill array with a range of numbers
        for (line = changeObj.from.line; line < changeObj.from.line + changeObj.text.length; line += 1) {
            component.checkLine.call(component, line, changeObj.origin);
        }
    
        // Is this a line which may have had a marker on it?
        component.checkMarkers.call(component);
    
        cm.component.set('value', cm.getValue());
    
        component.sendAction('typingPause');
    };
    
    onScrollHandler = function (cm) {
        var scrollInfo = cm.getScrollInfo(),
            component = cm.component;
    
        scrollInfo.codemirror = cm;
    
        // throttle scroll updates
        component.throttle = Ember.run.throttle(component, function () {
            this.set('scrollInfo', scrollInfo);
        }, 10);
    };
    
    Codemirror = Ember.TextArea.extend(MarkerManager, {
        focus: true,
        focusCursorAtEnd: false,
    
        setFocus: function () {
            if (this.get('focus')) {
                this.$().val(this.$().val()).focus();
            }
        }.on('didInsertElement'),
    
        didInsertElement: function () {
            Ember.run.scheduleOnce('afterRender', this, this.afterRenderEvent);
        },
    
        afterRenderEvent: function () {
            var self = this,
                codemirror;
    
            // replaces CodeMirror with TouchEditor only if we're on mobile
            mobileCodeMirror.createIfMobile();
    
            codemirror = this.initCodemirror();
            this.set('codemirror', codemirror);
    
            this.sendAction('setCodeMirror', this);
    
            if (this.get('focus') && this.get('focusCursorAtEnd')) {
                codemirror.execCommand('goDocEnd');
            }
    
            codemirror.eachLine(function initMarkers() {
                self.initMarkers.apply(self, arguments);
            });
        },
    
        // this needs to be placed on the 'afterRender' queue otherwise CodeMirror gets wonky
        initCodemirror: function () {
            // create codemirror
            var codemirror,
                self = this;
    
            codemirror = CodeMirror.fromTextArea(this.get('element'), {
                mode:           'gfm',
                tabMode:        'indent',
                tabindex:       '2',
                cursorScrollMargin: 10,
                lineWrapping:   true,
                dragDrop:       false,
                extraKeys: {
                    Home:   'goLineLeft',
                    End:    'goLineRight',
                    'Ctrl-U': false,
                    'Cmd-U': false,
                    'Shift-Ctrl-U': false,
                    'Shift-Cmd-U': false,
                    'Ctrl-S': false,
                    'Cmd-S': false,
                    'Ctrl-D': false,
                    'Cmd-D': false
                }
            });
    
            // Codemirror needs a reference to the component
            // so that codemirror originating events can propogate
            // up the ember action pipeline
            codemirror.component = this;
    
            // propagate changes to value property
            codemirror.on('change', onChangeHandler);
    
            // on scroll update scrollPosition property
            codemirror.on('scroll', onScrollHandler);
    
            codemirror.on('scroll', Ember.run.bind(Ember.$('.CodeMirror-scroll'), setScrollClassName, {
                target: Ember.$('.js-entry-markdown'),
                offset: 10
            }));
    
            codemirror.on('focus', function () {
                self.sendAction('onFocusIn');
            });
    
            return codemirror;
        },
    
        disableCodeMirror: function () {
            var codemirror = this.get('codemirror');
    
            codemirror.setOption('readOnly', 'nocursor');
            codemirror.off('change', onChangeHandler);
        },
    
        enableCodeMirror: function () {
            var codemirror = this.get('codemirror');
    
            codemirror.setOption('readOnly', false);
    
            // clicking the trash button on an image dropzone causes this function to fire.
            // this line is a hack to prevent multiple event handlers from being attached.
            codemirror.off('change', onChangeHandler);
    
            codemirror.on('change', onChangeHandler);
        },
    
        removeThrottle: function () {
            Ember.run.cancel(this.throttle);
        }.on('willDestroyElement'),
    
        removeCodemirrorHandlers: function () {
            // not sure if this is needed.
            var codemirror = this.get('codemirror');
            codemirror.off('change', onChangeHandler);
            codemirror.off('scroll');
        }.on('willDestroyElement'),
    
        clearMarkerManagerMarkers: function () {
            this.clearMarkers();
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = Codemirror;
  });
define("ghost/components/gh-dropdown-button", 
  ["ghost/mixins/dropdown-mixin","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var DropdownMixin = __dependency1__["default"];

    
    var DropdownButton = Ember.Component.extend(DropdownMixin, {
        tagName: 'button',
    
        // matches with the dropdown this button toggles
        dropdownName: null,
    
        // Notify dropdown service this dropdown should be toggled
        click: function (event) {
            this._super(event);
            this.get('dropdown').toggleDropdown(this.get('dropdownName'), this);
        }
    });
    
    __exports__["default"] = DropdownButton;
  });
define("ghost/components/gh-dropdown", 
  ["ghost/mixins/dropdown-mixin","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var DropdownMixin = __dependency1__["default"];

    
    var GhostDropdown = Ember.Component.extend(DropdownMixin, {
        classNames: 'ghost-dropdown',
        name: null,
        closeOnClick: false,
    
        // Helps track the user re-opening the menu while it's fading out.
        closing: false,
    
        // Helps track whether the dropdown is open or closes, or in a transition to either
        isOpen: false,
    
        // Managed the toggle between the fade-in and fade-out classes
        fadeIn: Ember.computed('isOpen', 'closing', function () {
            return this.get('isOpen') && !this.get('closing');
        }),
    
        classNameBindings: ['fadeIn:fade-in-scale:fade-out', 'isOpen:open:closed'],
    
        open: function () {
            this.set('isOpen', true);
            this.set('closing', false);
            this.set('button.isOpen', true);
        },
    
        close: function () {
            var self = this;
    
            this.set('closing', true);
    
            if (this.get('button')) {
                this.set('button.isOpen', false);
            }
            this.$().on('animationend webkitAnimationEnd oanimationend MSAnimationEnd', function (event) {
                if (event.originalEvent.animationName === 'fade-out') {
                    if (self.get('closing')) {
                        self.set('isOpen', false);
                        self.set('closing', false);
                    }
                }
            });
        },
    
        // Called by the dropdown service when any dropdown button is clicked.
        toggle: function (options) {
            var isClosing = this.get('closing'),
                isOpen = this.get('isOpen'),
                name = this.get('name'),
                button = this.get('button'),
                targetDropdownName = options.target;
    
            if (name === targetDropdownName && (!isOpen || isClosing)) {
                if (!button) {
                    button = options.button;
                    this.set('button', button);
                }
                this.open();
            } else if (isOpen) {
                this.close();
            }
        },
    
        click: function (event) {
            this._super(event);
    
            if (this.get('closeOnClick')) {
                return this.close();
            }
        },
    
        didInsertElement: function () {
            this._super();
    
            var dropdownService = this.get('dropdown');
    
            dropdownService.on('close', this, this.close);
            dropdownService.on('toggle', this, this.toggle);
        },
    
        willDestroyElement: function () {
            this._super();
    
            var dropdownService = this.get('dropdown');
    
            dropdownService.off('close', this, this.close);
            dropdownService.off('toggle', this, this.toggle);
        }
    });
    
    __exports__["default"] = GhostDropdown;
  });
define("ghost/components/gh-file-upload", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var FileUpload = Ember.Component.extend({
        _file: null,
    
        uploadButtonText: 'Text',
    
        uploadButtonDisabled: true,
    
        change: function (event) {
            this.set('uploadButtonDisabled', false);
            this.sendAction('onAdd');
            this._file = event.target.files[0];
        },
    
        onUpload: 'onUpload',
    
        actions: {
            upload: function () {
                if (!this.uploadButtonDisabled && this._file) {
                    this.sendAction('onUpload', this._file);
                }
    
                // Prevent double post by disabling the button.
                this.set('uploadButtonDisabled', true);
            }
        }
    });
    
    __exports__["default"] = FileUpload;
  });
define("ghost/components/gh-form", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var Form = Ember.View.extend({
        tagName: 'form',
        attributeBindings: ['enctype'],
        reset: function () {
            this.$().get(0).reset();
        },
        didInsertElement: function () {
            this.get('controller').on('reset', this, this.reset);
        },
        willClearRender: function () {
            this.get('controller').off('reset', this, this.reset);
        }
    });
    
    __exports__["default"] = Form;
  });
define("ghost/components/gh-input", 
  ["ghost/mixins/text-input","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var TextInputMixin = __dependency1__["default"];

    
    var Input = Ember.TextField.extend(TextInputMixin);
    
    __exports__["default"] = Input;
  });
define("ghost/components/gh-markdown", 
  ["ghost/assets/lib/uploader","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var uploader = __dependency1__["default"];

    
    var Markdown = Ember.Component.extend({
        didInsertElement: function () {
            this.set('scrollWrapper', this.$().closest('.entry-preview-content'));
        },
    
        adjustScrollPosition: function () {
            var scrollWrapper = this.get('scrollWrapper'),
                scrollPosition = this.get('scrollPosition');
    
            scrollWrapper.scrollTop(scrollPosition);
        }.observes('scrollPosition'),
    
        // fire off 'enable' API function from uploadManager
        // might need to make sure markdown has been processed first
        reInitDropzones: function () {
            function handleDropzoneEvents() {
                var dropzones = $('.js-drop-zone');
    
                uploader.call(dropzones, {
                    editor: true,
                    fileStorage: this.get('config.fileStorage')
                });
    
                dropzones.on('uploadstart', Ember.run.bind(this, 'sendAction', 'uploadStarted'));
                dropzones.on('uploadfailure', Ember.run.bind(this, 'sendAction', 'uploadFinished'));
                dropzones.on('uploadsuccess', Ember.run.bind(this, 'sendAction', 'uploadFinished'));
                dropzones.on('uploadsuccess', Ember.run.bind(this, 'sendAction', 'uploadSuccess'));
            }
    
            Ember.run.scheduleOnce('afterRender', this, handleDropzoneEvents);
        }.observes('markdown')
    });
    
    __exports__["default"] = Markdown;
  });
define("ghost/components/gh-modal-dialog", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ModalDialog = Ember.Component.extend({
        didInsertElement: function () {
            this.$('.js-modal-container').fadeIn(50);
    
            this.$('.js-modal-background').show().fadeIn(10, function () {
                $(this).addClass('in');
            });
    
            this.$('.js-modal').addClass('in');
        },
    
        willDestroyElement: function () {
            this.$('.js-modal').removeClass('in');
    
            this.$('.js-modal-background').removeClass('in');
    
            return this._super();
        },
    
        confirmaccept: 'confirmAccept',
        confirmreject: 'confirmReject',
    
        actions: {
            closeModal: function () {
                this.sendAction();
            },
            confirm: function (type) {
                this.sendAction('confirm' + type);
                this.sendAction();
            }
        },
    
        klass: Ember.computed('type', 'style', 'animation', function () {
            var classNames = [];
    
            classNames.push(this.get('type') ? 'modal-' + this.get('type') : 'modal');
    
            if (this.get('style')) {
                this.get('style').split(',').forEach(function (style) {
                    classNames.push('modal-style-' + style);
                });
            }
    
            classNames.push(this.get('animation'));
    
            return classNames.join(' ');
        }),
    
        acceptButtonClass: Ember.computed('confirm.accept.buttonClass', function () {
            return this.get('confirm.accept.buttonClass') ? this.get('confirm.accept.buttonClass') : 'btn btn-green';
        }),
    
        rejectButtonClass: Ember.computed('confirm.reject.buttonClass', function () {
            return this.get('confirm.reject.buttonClass') ? this.get('confirm.reject.buttonClass') : 'btn btn-red';
        })
    });
    
    __exports__["default"] = ModalDialog;
  });
define("ghost/components/gh-notification", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var NotificationComponent = Ember.Component.extend({
        classNames: ['js-bb-notification'],
    
        typeClass: Ember.computed(function () {
            var classes = '',
                message = this.get('message'),
                type,
                dismissible;
    
            // Check to see if we're working with a DS.Model or a plain JS object
            if (typeof message.toJSON === 'function') {
                type = message.get('type');
                dismissible = message.get('dismissible');
            } else {
                type = message.type;
                dismissible = message.dismissible;
            }
    
            classes += 'notification-' + type;
    
            if (type === 'success' && dismissible !== false) {
                classes += ' notification-passive';
            }
    
            return classes;
        }),
    
        didInsertElement: function () {
            var self = this;
    
            self.$().on('animationend webkitAnimationEnd oanimationend MSAnimationEnd', function (event) {
                if (event.originalEvent.animationName === 'fade-out') {
                    self.notifications.removeObject(self.get('message'));
                }
            });
        },
    
        actions: {
            closeNotification: function () {
                var self = this;
                self.notifications.closeNotification(self.get('message'));
            }
        }
    });
    
    __exports__["default"] = NotificationComponent;
  });
define("ghost/components/gh-notifications", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var NotificationsComponent = Ember.Component.extend({
        tagName: 'aside',
        classNames: 'notifications',
        classNameBindings: ['location'],
    
        messages: Ember.computed.filter('notifications', function (notification) {
            // If this instance of the notifications component has no location affinity
            // then it gets all notifications
            if (!this.get('location')) {
                return true;
            }
    
            var displayLocation = (typeof notification.toJSON === 'function') ?
                notification.get('location') : notification.location;
    
            return this.get('location') === displayLocation;
        }),
    
        messageCountObserver: function () {
            this.sendAction('notify', this.get('messages').length);
        }.observes('messages.[]')
    });
    
    __exports__["default"] = NotificationsComponent;
  });
define("ghost/components/gh-popover-button", 
  ["ghost/components/gh-dropdown-button","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var DropdownButton = __dependency1__["default"];

    
    var PopoverButton = DropdownButton.extend({
        click: Ember.K, // We don't want clicks on popovers, but dropdowns have them. So `K`ill them here.
    
        mouseEnter: function (event) {
            this._super(event);
            this.get('dropdown').toggleDropdown(this.get('popoverName'), this);
        },
    
        mouseLeave: function (event) {
            this._super(event);
            this.get('dropdown').toggleDropdown(this.get('popoverName'), this);
        }
    });
    
    __exports__["default"] = PopoverButton;
  });
define("ghost/components/gh-popover", 
  ["ghost/components/gh-dropdown","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var GhostDropdown = __dependency1__["default"];

    
    var GhostPopover = GhostDropdown.extend({
        classNames: 'ghost-popover'
    });
    
    __exports__["default"] = GhostPopover;
  });
define("ghost/components/gh-role-selector", 
  ["ghost/components/gh-select","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var GhostSelect = __dependency1__["default"];

    
    var RolesSelector = GhostSelect.extend({
        roles: Ember.computed.alias('options'),
    
        options: Ember.computed(function () {
            var rolesPromise = this.store.find('role', {permissions: 'assign'});
    
            return Ember.ArrayProxy.extend(Ember.PromiseProxyMixin)
                .create({promise: rolesPromise});
        })
    });
    
    __exports__["default"] = RolesSelector;
  });
define("ghost/components/gh-select", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // GhostSelect is a solution to Ember.Select being evil and worthless.
    // (Namely, this solves problems with async data in Ember.Select)
    // Inspired by (that is, totally ripped off from) this JSBin
    // http://emberjs.jsbin.com/rwjblue/40/edit
    
    // Usage:
    // Extend this component and create a template for your component.
    // Your component must define the `options` property.
    // Optionally use `initialValue` to set the object
    //     you want to have selected to start with.
    // Both options and initalValue are promise safe.
    // Set onChange in your template to be the name
    //    of the action you want called in your
    // For an example, see gh-roles-selector
    
    var GhostSelect = Ember.Component.extend({
        tagName: 'span',
        classNames: ['gh-select'],
        attributeBindings: ['tabindex'],
    
        tabindex: '0', // 0 must be a string, or else it's interpreted as false
    
        options: null,
        initialValue: null,
    
        resolvedOptions: null,
        resolvedInitialValue: null,
    
        // Convert promises to their values
        init: function () {
            var self = this;
    
            this._super.apply(this, arguments);
    
            Ember.RSVP.hash({
                resolvedOptions: this.get('options'),
                resolvedInitialValue: this.get('initialValue')
            }).then(function (resolvedHash) {
                self.setProperties(resolvedHash);
    
                // Run after render to ensure the <option>s have rendered
                Ember.run.schedule('afterRender', function () {
                    self.setInitialValue();
                });
            });
        },
    
        setInitialValue: function () {
            var initialValue = this.get('resolvedInitialValue'),
                options = this.get('resolvedOptions'),
                initialValueIndex = options.indexOf(initialValue);
    
            if (initialValueIndex > -1) {
                this.$('option:eq(' + initialValueIndex + ')').prop('selected', true);
            }
        },
    
        // Called by DOM events
        change: function () {
            this._changeSelection();
        },
    
        // Send value to specified action
        _changeSelection: function () {
            var value = this._selectedValue();
    
            Ember.set(this, 'value', value);
            this.sendAction('onChange', value);
        },
    
        _selectedValue: function () {
            var selectedIndex = this.$('select')[0].selectedIndex;
    
            return this.get('options').objectAt(selectedIndex);
        }
    });
    
    __exports__["default"] = GhostSelect;
  });
define("ghost/components/gh-tab-pane", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // See gh-tabs-manager.js for use
    var TabPane = Ember.Component.extend({
        classNameBindings: ['active'],
    
        tabsManager: Ember.computed(function () {
            return this.nearestWithProperty('isTabsManager');
        }),
    
        tab: Ember.computed('tabsManager.tabs.[]', 'tabsManager.tabPanes.[]', function () {
            var index = this.get('tabsManager.tabPanes').indexOf(this),
                tabs = this.get('tabsManager.tabs');
    
            return tabs && tabs.objectAt(index);
        }),
    
        active: Ember.computed.alias('tab.active'),
    
        // Register with the tabs manager
        registerWithTabs: function () {
            this.get('tabsManager').registerTabPane(this);
        }.on('didInsertElement'),
    
        unregisterWithTabs: function () {
            this.get('tabsManager').unregisterTabPane(this);
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = TabPane;
  });
define("ghost/components/gh-tab", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // See gh-tabs-manager.js for use
    var Tab = Ember.Component.extend({
        tabsManager: Ember.computed(function () {
            return this.nearestWithProperty('isTabsManager');
        }),
    
        active: Ember.computed('tabsManager.activeTab', function () {
            return this.get('tabsManager.activeTab') === this;
        }),
    
        index: Ember.computed('tabsManager.tabs.@each', function () {
            return this.get('tabsManager.tabs').indexOf(this);
        }),
    
        // Select on click
        click: function () {
            this.get('tabsManager').select(this);
        },
    
        // Registration methods
        registerWithTabs: function () {
            this.get('tabsManager').registerTab(this);
        }.on('didInsertElement'),
    
        unregisterWithTabs: function () {
            this.get('tabsManager').unregisterTab(this);
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = Tab;
  });
define("ghost/components/gh-tabs-manager", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
    Heavily inspired by ic-tabs (https://github.com/instructure/ic-tabs)
    
    Three components work together for smooth tabbing.
    1. tabs-manager (gh-tabs)
    2. tab (gh-tab)
    3. tab-pane (gh-tab-pane)
    
    ## Usage:
    The tabs-manager must wrap all tab and tab-pane components,
    but they can be nested at any level.
    
    A tab and its pane are tied together via their order.
    So, the second tab within a tab manager will activate
    the second pane within that manager.
    
    ```hbs
    {{#gh-tabs-manager}}
      {{#gh-tab}}
        First tab
      {{/gh-tab}}
      {{#gh-tab}}
        Second tab
      {{/gh-tab}}
    
      ....
      {{#gh-tab-pane}}
        First pane
      {{/gh-tab-pane}}
      {{#gh-tab-pane}}
        Second pane
      {{/gh-tab-pane}}
    {{/gh-tabs-manager}}
    ```
    ## Options:
    
    the tabs-manager will send a "selected" action whenever one of its
    tabs is clicked.
    ```hbs
    {{#gh-tabs-manager selected="myAction"}}
        ....
    {{/gh-tabs-manager}}
    ```
    
    ## Styling:
    Both tab and tab-pane elements have an "active"
    class applied when they are active.
    
    */
    var TabsManager = Ember.Component.extend({
        activeTab: null,
        tabs: [],
        tabPanes: [],
    
        // Called when a gh-tab is clicked.
        select: function (tab) {
            this.set('activeTab', tab);
            this.sendAction('selected');
        },
    
        // Used by children to find this tabsManager
        isTabsManager: true,
    
        // Register tabs and their panes to allow for
        // interaction between components.
        registerTab: function (tab) {
            this.get('tabs').addObject(tab);
        },
    
        unregisterTab: function (tab) {
            this.get('tabs').removeObject(tab);
        },
    
        registerTabPane: function (tabPane) {
            this.get('tabPanes').addObject(tabPane);
        },
    
        unregisterTabPane: function (tabPane) {
            this.get('tabPanes').removeObject(tabPane);
        }
    });
    
    __exports__["default"] = TabsManager;
  });
define("ghost/components/gh-textarea", 
  ["ghost/mixins/text-input","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var TextInputMixin = __dependency1__["default"];

    
    var TextArea = Ember.TextArea.extend(TextInputMixin);
    
    __exports__["default"] = TextArea;
  });
define("ghost/components/gh-trim-focus-input", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*global device*/
    var TrimFocusInput = Ember.TextField.extend({
        focus: true,
    
        attributeBindings: ['autofocus'],
    
        autofocus: Ember.computed(function () {
            return (device.ios()) ? false : 'autofocus';
        }),
    
        setFocus: function () {
            // This fix is required until Mobile Safari has reliable
            // autofocus, select() or focus() support
            if (this.focus && !device.ios()) {
                this.$().val(this.$().val()).focus();
            }
        }.on('didInsertElement'),
    
        focusOut: function () {
            var text = this.$().val();
    
            this.$().val(text.trim());
        }
    });
    
    __exports__["default"] = TrimFocusInput;
  });
define("ghost/components/gh-upload-modal", 
  ["ghost/components/gh-modal-dialog","ghost/assets/lib/uploader","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ModalDialog = __dependency1__["default"];

    var upload = __dependency2__["default"];

    
    var UploadModal = ModalDialog.extend({
        layoutName: 'components/gh-modal-dialog',
    
        didInsertElement: function () {
            this._super();
            upload.call(this.$('.js-drop-zone'), {fileStorage: this.get('config.fileStorage')});
        },
        confirm: {
            reject: {
                func: function () { // The function called on rejection
                    return true;
                },
                buttonClass: 'btn btn-default',
                text: 'Cancel' // The reject button text
            },
            accept: {
                buttonClass: 'btn btn-blue right',
                text: 'Save', // The accept button texttext: 'Save'
                func: function () {
                    var imageType = 'model.' + this.get('imageType');
    
                    if (this.$('.js-upload-url').val()) {
                        this.set(imageType, this.$('.js-upload-url').val());
                    } else {
                        this.set(imageType, this.$('.js-upload-target').attr('src'));
                    }
                    return true;
                }
            }
        },
    
        actions: {
            closeModal: function () {
                this.sendAction();
            },
            confirm: function (type) {
                var func = this.get('confirm.' + type + '.func');
                if (typeof func === 'function') {
                    func.apply(this);
                }
                this.sendAction();
                this.sendAction('confirm' + type);
            }
        }
    });
    
    __exports__["default"] = UploadModal;
  });
define("ghost/components/gh-uploader", 
  ["ghost/assets/lib/uploader","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var uploader = __dependency1__["default"];

    
    var PostImageUploader = Ember.Component.extend({
        classNames: ['image-uploader', 'js-post-image-upload'],
    
        setup: function () {
            var $this = this.$(),
                self = this;
    
            this.set('uploaderReference', uploader.call($this, {
                editor: true,
                fileStorage: this.get('config.fileStorage')
            }));
    
            $this.on('uploadsuccess', function (event, result) {
                if (result && result !== '' && result !== 'http://') {
                    self.sendAction('uploaded', result);
                }
            });
    
            $this.on('imagecleared', function () {
                self.sendAction('canceled');
            });
        }.on('didInsertElement'),
    
        removeListeners: function () {
            var $this = this.$();
    
            $this.off();
            $this.find('.js-cancel').off();
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = PostImageUploader;
  });
define("ghost/config", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function configureApp(App) {
        if (!App instanceof Ember.Application) {
            return;
        }
    }
    
    __exports__["default"] = configureApp;
  });
define("ghost/controllers/application", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ApplicationController = Ember.Controller.extend({
        // jscs: disable
        hideNav: Ember.computed.match('currentPath', /(error|signin|signup|setup|forgotten|reset)/),
        // jscs: enable
    
        topNotificationCount: 0,
        showGlobalMobileNav: false,
        showSettingsMenu: false,
    
         userImageAlt: Ember.computed('session.user.name', function () {
            var name = this.get('session.user.name');
    
            return name + '\'s profile picture';
        }),
    
        actions: {
            topNotificationChange: function (count) {
                this.set('topNotificationCount', count);
            }
        }
    });
    
    __exports__["default"] = ApplicationController;
  });
define("ghost/controllers/editor/edit", 
  ["ghost/mixins/editor-base-controller","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EditorControllerMixin = __dependency1__["default"];

    
    var EditorEditController = Ember.ObjectController.extend(EditorControllerMixin);
    
    __exports__["default"] = EditorEditController;
  });
define("ghost/controllers/editor/new", 
  ["ghost/mixins/editor-base-controller","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EditorControllerMixin = __dependency1__["default"];

    
    var EditorNewController = Ember.ObjectController.extend(EditorControllerMixin, {
        actions: {
            /**
              * Redirect to editor after the first save
              */
            save: function (options) {
                var self = this;
                return this._super(options).then(function (model) {
                    if (model.get('id')) {
                        self.replaceRoute('editor.edit', model);
                    }
                });
            }
        }
    });
    
    __exports__["default"] = EditorNewController;
  });
define("ghost/controllers/error", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ErrorController = Ember.Controller.extend({
        code: Ember.computed('content.status', function () {
            return this.get('content.status') > 200 ? this.get('content.status') : 500;
        }),
        message: Ember.computed('content.statusText', function () {
            if (this.get('code') === 404) {
                return 'No Ghost Found';
            }
    
            return this.get('content.statusText') !== 'error' ? this.get('content.statusText') : 'Internal Server Error';
        }),
        stack: false
    });
    
    __exports__["default"] = ErrorController;
  });
define("ghost/controllers/forgotten", 
  ["ghost/utils/ajax","ghost/mixins/validation-engine","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ajax = __dependency1__["default"];

    var ValidationEngine = __dependency2__["default"];

    
    var ForgottenController = Ember.Controller.extend(ValidationEngine, {
        email: '',
        submitting: false,
    
        // ValidationEngine settings
        validationType: 'forgotten',
    
        actions: {
            submit: function () {
                var self = this,
                    data = self.getProperties('email');
    
                this.toggleProperty('submitting');
                this.validate({format: false}).then(function () {
                    ajax({
                        url: self.get('ghostPaths.url').api('authentication', 'passwordreset'),
                        type: 'POST',
                        data: {
                            passwordreset: [{
                                email: data.email
                            }]
                        }
                    }).then(function () {
                        self.toggleProperty('submitting');
                        self.notifications.showSuccess('Please check your email for instructions.', {delayed: true});
                        self.set('email', '');
                        self.transitionToRoute('signin');
                    }).catch(function (resp) {
                        self.toggleProperty('submitting');
                        self.notifications.showAPIError(resp, {defaultErrorText: 'There was a problem with the reset, please try again.'});
                    });
                }).catch(function (errors) {
                    self.toggleProperty('submitting');
                    self.notifications.showErrors(errors);
                });
            }
        }
    });
    
    __exports__["default"] = ForgottenController;
  });
define("ghost/controllers/modals/copy-html", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var CopyHTMLController = Ember.Controller.extend({
    
        generatedHTML: Ember.computed.alias('model.generatedHTML')
    
    });
    
    __exports__["default"] = CopyHTMLController;
  });
define("ghost/controllers/modals/delete-all", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var DeleteAllController = Ember.Controller.extend({
        actions: {
            confirmAccept: function () {
                var self = this;
    
                ic.ajax.request(this.get('ghostPaths.url').api('db'), {
                    type: 'DELETE'
                }).then(function () {
                    self.notifications.showSuccess('All content deleted from database.');
                    self.store.unloadAll('post');
                    self.store.unloadAll('tag');
                }).catch(function (response) {
                    self.notifications.showErrors(response);
                });
            },
    
            confirmReject: function () {
                return false;
            }
        },
    
        confirm: {
            accept: {
                text: 'Delete',
                buttonClass: 'btn btn-red'
            },
            reject: {
                text: 'Cancel',
                buttonClass: 'btn btn-default btn-minor'
            }
        }
    });
    
    __exports__["default"] = DeleteAllController;
  });
define("ghost/controllers/modals/delete-post", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var DeletePostController = Ember.Controller.extend({
        actions: {
            confirmAccept: function () {
                var self = this,
                    model = this.get('model');
    
                // definitely want to clear the data store and post of any unsaved, client-generated tags
                model.updateTags();
    
                model.destroyRecord().then(function () {
                    self.get('dropdown').closeDropdowns();
                    self.transitionToRoute('posts.index');
                    self.notifications.showSuccess('Your post has been deleted.', {delayed: true});
                }, function () {
                    self.notifications.showError('Your post could not be deleted. Please try again.');
                });
            },
    
            confirmReject: function () {
                return false;
            }
        },
    
        confirm: {
            accept: {
                text: 'Delete',
                buttonClass: 'btn btn-red'
            },
            reject: {
                text: 'Cancel',
                buttonClass: 'btn btn-default btn-minor'
            }
        }
    });
    
    __exports__["default"] = DeletePostController;
  });
define("ghost/controllers/modals/delete-user", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var DeleteUserController = Ember.ObjectController.extend({
        userPostCount: Ember.computed('id', function () {
            var promise,
                query = {
                    author: this.get('slug'),
                    status: 'all'
                };
    
            promise = this.store.find('post', query).then(function (results) {
                return results.meta.pagination.total;
            });
    
            return Ember.Object.extend(Ember.PromiseProxyMixin, {
                count: Ember.computed.alias('content'),
    
                inflection: Ember.computed('count', function () {
                    return this.get('count') > 1 ? 'posts' : 'post';
                })
            }).create({promise: promise});
        }),
    
        actions: {
            confirmAccept: function () {
                var self = this,
                    user = this.get('model');
    
                user.destroyRecord().then(function () {
                    self.store.unloadAll('post');
                    self.transitionToRoute('settings.users');
                    self.notifications.showSuccess('The user has been deleted.', {delayed: true});
                }, function () {
                    self.notifications.showError('The user could not be deleted. Please try again.');
                });
            },
    
            confirmReject: function () {
                return false;
            }
        },
    
        confirm: {
            accept: {
                text: 'Delete User',
                buttonClass: 'btn btn-red'
            },
            reject: {
                text: 'Cancel',
                buttonClass: 'btn btn-default btn-minor'
            }
        }
    });
    
    __exports__["default"] = DeleteUserController;
  });
define("ghost/controllers/modals/invite-new-user", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var InviteNewUserController = Ember.Controller.extend({
        // Used to set the initial value for the dropdown
        authorRole: Ember.computed(function () {
            var self = this;
    
            return this.store.find('role').then(function (roles) {
                var authorRole = roles.findBy('name', 'Author');
    
                // Initialize role as well.
                self.set('role', authorRole);
                self.set('authorRole', authorRole);
    
                return authorRole;
            });
        }),
    
        confirm: {
            accept: {
                text: 'send invitation now'
            },
            reject: {
                buttonClass: 'hidden'
            }
        },
    
        actions: {
            setRole: function (role) {
                this.set('role', role);
            },
    
            confirmAccept: function () {
                var email = this.get('email'),
                    role = this.get('role'),
                    self = this,
                    newUser;
    
                // reset the form and close the modal
                self.set('email', '');
                self.set('role', self.get('authorRole'));
                self.send('closeModal');
    
                this.store.find('user').then(function (result) {
                    var invitedUser = result.findBy('email', email);
    
                    if (invitedUser) {
                        if (invitedUser.get('status') === 'invited' || invitedUser.get('status') === 'invited-pending') {
                            self.notifications.showWarn('A user with that email address was already invited.');
                        } else {
                            self.notifications.showWarn('A user with that email address already exists.');
                        }
                    } else {
                        newUser = self.store.createRecord('user', {
                            email: email,
                            status: 'invited',
                            role: role
                        });
    
                        newUser.save().then(function () {
                            var notificationText = 'Invitation sent! (' + email + ')';
    
                            // If sending the invitation email fails, the API will still return a status of 201
                            // but the user's status in the response object will be 'invited-pending'.
                            if (newUser.get('status') === 'invited-pending') {
                                self.notifications.showWarn('Invitation email was not sent.  Please try resending.');
                            } else {
                                self.notifications.showSuccess(notificationText);
                            }
                        }).catch(function (errors) {
                            newUser.deleteRecord();
                            self.notifications.showErrors(errors);
                        });
                    }
                });
            },
    
            confirmReject: function () {
                return false;
            }
        }
    });
    
    __exports__["default"] = InviteNewUserController;
  });
define("ghost/controllers/modals/leave-editor", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var LeaveEditorController = Ember.Controller.extend({
        args: Ember.computed.alias('model'),
    
        actions: {
            confirmAccept: function () {
                var args = this.get('args'),
                    editorController,
                    model,
                    transition;
    
                if (Ember.isArray(args)) {
                    editorController = args[0];
                    transition = args[1];
                    model = editorController.get('model');
                }
    
                if (!transition || !editorController) {
                    this.notifications.showError('Sorry, there was an error in the application. Please let the Ghost team know what happened.');
    
                    return true;
                }
    
                // definitely want to clear the data store and post of any unsaved, client-generated tags
                model.updateTags();
    
                if (model.get('isNew')) {
                    // the user doesn't want to save the new, unsaved post, so delete it.
                    model.deleteRecord();
                } else {
                    // roll back changes on model props
                    model.rollback();
                }
    
                // setting isDirty to false here allows willTransition on the editor route to succeed
                editorController.set('isDirty', false);
    
                // since the transition is now certain to complete, we can unset window.onbeforeunload here
                window.onbeforeunload = null;
    
                transition.retry();
            },
    
            confirmReject: function () {
            }
        },
    
        confirm: {
            accept: {
                text: 'Leave',
                buttonClass: 'btn btn-red'
            },
            reject: {
                text: 'Stay',
                buttonClass: 'btn btn-default btn-minor'
            }
        }
    });
    
    __exports__["default"] = LeaveEditorController;
  });
define("ghost/controllers/modals/signin", 
  ["ghost/controllers/signin","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var SigninController = __dependency1__["default"];

    
    __exports__["default"] = SigninController.extend({
        needs: 'application',
    
        identification: Ember.computed('session.user.email', function () {
            return this.get('session.user.email');
        }),
    
        actions: {
            authenticate: function () {
                var appController = this.get('controllers.application'),
                    self = this;
    
                appController.set('skipAuthSuccessHandler', true);
    
                this._super().then(function () {
                    self.send('closeModal');
                    self.notifications.showSuccess('Login successful.');
                    self.set('password', '');
                }).finally(function () {
                    appController.set('skipAuthSuccessHandler', undefined);
                });
            },
    
            confirmAccept: function () {
                this.send('validateAndAuthenticate');
            }
        }
    });
  });
define("ghost/controllers/modals/transfer-owner", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var TransferOwnerController = Ember.Controller.extend({
        actions: {
            confirmAccept: function () {
                var user = this.get('model'),
                    url = this.get('ghostPaths.url').api('users', 'owner'),
                    self = this;
    
                self.get('dropdown').closeDropdowns();
    
                ic.ajax.request(url, {
                    type: 'PUT',
                    data: {
                        owner: [{
                            id: user.get('id')
                        }]
                    }
                }).then(function (response) {
                    // manually update the roles for the users that just changed roles
                    // because store.pushPayload is not working with embedded relations
                    if (response && Ember.isArray(response.users)) {
                        response.users.forEach(function (userJSON) {
                            var user = self.store.getById('user', userJSON.id),
                                role = self.store.getById('role', userJSON.roles[0].id);
    
                            user.set('role', role);
                        });
                    }
    
                    self.notifications.showSuccess('Ownership successfully transferred to ' + user.get('name'));
                }).catch(function (error) {
                    self.notifications.showAPIError(error);
                });
            },
    
            confirmReject: function () {
                return false;
            }
        },
    
        confirm: {
            accept: {
                text: 'Yep - I\'m sure',
                buttonClass: 'btn btn-red'
            },
            reject: {
                text: 'Cancel',
                buttonClass: 'btn btn-default btn-minor'
            }
        }
    });
    
    __exports__["default"] = TransferOwnerController;
  });
define("ghost/controllers/modals/upload", 
  ["exports"],
  function(__exports__) {
    "use strict";
    
    var UploadController = Ember.Controller.extend({
        acceptEncoding: 'image/*',
        actions: {
            confirmAccept: function () {
                var self = this;
    
                this.get('model').save().then(function (model) {
                    self.notifications.showSuccess('Saved');
                    return model;
                }).catch(function (err) {
                    self.notifications.showErrors(err);
                });
            },
    
            confirmReject: function () {
                return false;
            }
        }
    });
    
    __exports__["default"] = UploadController;
  });
define("ghost/controllers/post-settings-menu", 
  ["ghost/utils/date-formatting","ghost/models/slug-generator","ghost/utils/bound-one-way","ghost/utils/isNumber","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    /* global moment */
    var parseDateString = __dependency1__.parseDateString;
    var formatDate = __dependency1__.formatDate;

    var SlugGenerator = __dependency2__["default"];

    var boundOneWay = __dependency3__["default"];

    var isNumber = __dependency4__["default"];

    
    var PostSettingsMenuController = Ember.ObjectController.extend({
        // State for if the user is viewing a tab's pane.
        needs: 'application',
    
        lastPromise: null,
    
        isViewingSubview: Ember.computed('controllers.application.showSettingsMenu', function (key, value) {
            // Not viewing a subview if we can't even see the PSM
            if (!this.get('controllers.application.showSettingsMenu')) {
                return false;
            }
            if (arguments.length > 1) {
                return value;
            }
    
            return false;
        }),
    
        selectedAuthor: null,
        initializeSelectedAuthor: function () {
            var self = this;
    
            return this.get('author').then(function (author) {
                self.set('selectedAuthor', author);
                return author;
            });
        }.observes('model'),
    
        changeAuthor: function () {
            var author = this.get('author'),
                selectedAuthor = this.get('selectedAuthor'),
                model = this.get('model'),
                self = this;
    
            // return if nothing changed
            if (selectedAuthor.get('id') === author.get('id')) {
                return;
            }
    
            model.set('author', selectedAuthor);
    
            // if this is a new post (never been saved before), don't try to save it
            if (this.get('isNew')) {
                return;
            }
    
            model.save().catch(function (errors) {
                self.showErrors(errors);
                self.set('selectedAuthor', author);
                model.rollback();
            });
        }.observes('selectedAuthor'),
    
        authors: Ember.computed(function () {
            // Loaded asynchronously, so must use promise proxies.
            var deferred = {};
    
            deferred.promise = this.store.find('user', {limit: 'all'}).then(function (users) {
                return users.rejectBy('id', 'me').sortBy('name');
            }).then(function (users) {
                return users.filter(function (user) {
                    return user.get('active');
                });
            });
    
            return Ember.ArrayProxy
                .extend(Ember.PromiseProxyMixin)
                .create(deferred);
        }),
    
        publishedAtValue: Ember.computed('published_at', function () {
            var pubDate = this.get('published_at');
    
            if (pubDate) {
                return formatDate(pubDate);
            }
    
            return formatDate(moment());
        }),
    
        slugValue: boundOneWay('slug'),
    
        // Lazy load the slug generator
        slugGenerator: Ember.computed(function () {
            return SlugGenerator.create({
                ghostPaths: this.get('ghostPaths'),
                slugType: 'post'
            });
        }),
    
        // Requests slug from title
        generateAndSetSlug: function (destination) {
            var self = this,
                title = this.get('titleScratch'),
                afterSave = this.get('lastPromise'),
                promise;
    
            // Only set an "untitled" slug once per post
            if (title === '(Untitled)' && this.get('slug')) {
                return;
            }
    
            promise = Ember.RSVP.resolve(afterSave).then(function () {
                return self.get('slugGenerator').generateSlug(title).then(function (slug) {
                    self.set(destination, slug);
                }).catch(function () {
                    // Nothing to do (would be nice to log this somewhere though),
                    // but a rejected promise needs to be handled here so that a resolved
                    // promise is returned.
                });
            });
    
            this.set('lastPromise', promise);
        },
    
        metaTitleScratch: boundOneWay('meta_title'),
        metaDescriptionScratch: boundOneWay('meta_description'),
    
        seoTitle: Ember.computed('titleScratch', 'metaTitleScratch', function () {
            var metaTitle = this.get('metaTitleScratch') || '';
    
            metaTitle = metaTitle.length > 0 ? metaTitle : this.get('titleScratch');
    
            if (metaTitle.length > 70) {
                metaTitle = metaTitle.substring(0, 70).trim();
                metaTitle = Ember.Handlebars.Utils.escapeExpression(metaTitle);
                metaTitle = new Ember.Handlebars.SafeString(metaTitle + '&hellip;');
            }
    
            return metaTitle;
        }),
    
        seoDescription: Ember.computed('scratch', 'metaDescriptionScratch', function () {
            var metaDescription = this.get('metaDescriptionScratch') || '',
                el,
                html = '',
                placeholder;
    
            if (metaDescription.length > 0) {
                placeholder = metaDescription;
            } else {
                el = $('.rendered-markdown');
    
                // Get rendered markdown
                if (el !== undefined && el.length > 0) {
                    html = el.clone();
                    html.find('.js-drop-zone').remove();
                    html = html[0].innerHTML;
                }
    
                // Strip HTML
                placeholder = $('<div />', {html: html}).text();
                // Replace new lines and trim
                // jscs: disable
                placeholder = placeholder.replace(/\n+/g, ' ').trim();
                // jscs: enable
            }
    
            if (placeholder.length > 156) {
                // Limit to 156 characters
                placeholder = placeholder.substring(0, 156).trim();
                placeholder = Ember.Handlebars.Utils.escapeExpression(placeholder);
                placeholder = new Ember.Handlebars.SafeString(placeholder + '&hellip;');
            }
    
            return placeholder;
        }),
    
        seoURL: Ember.computed('slug', function () {
            var blogUrl = this.get('config').blogUrl,
                seoSlug = this.get('slug') ? this.get('slug') : '',
                seoURL = blogUrl + '/' + seoSlug;
    
            // only append a slash to the URL if the slug exists
            if (seoSlug) {
                seoURL += '/';
            }
    
            if (seoURL.length > 70) {
                seoURL = seoURL.substring(0, 70).trim();
                seoURL = new Ember.Handlebars.SafeString(seoURL + '&hellip;');
            }
    
            return seoURL;
        }),
    
        // observe titleScratch, keeping the post's slug in sync
        // with it until saved for the first time.
        addTitleObserver: function () {
            if (this.get('isNew') || this.get('title') === '(Untitled)') {
                this.addObserver('titleScratch', this, 'titleObserver');
            }
        }.observes('model'),
    
        titleObserver: function () {
            var debounceId,
                title = this.get('title');
    
            // generate a slug if a post is new and doesn't have a title yet or
            // if the title is still '(Untitled)' and the slug is unaltered.
            if ((this.get('isNew') && !title) || title === '(Untitled)') {
                debounceId = Ember.run.debounce(this, 'generateAndSetSlug', ['slug'], 700);
            }
    
            this.set('debounceId', debounceId);
        },
    
        showErrors: function (errors) {
            errors = Ember.isArray(errors) ? errors : [errors];
            this.notifications.showErrors(errors);
        },
    
        showSuccess: function (message) {
            this.notifications.showSuccess(message);
        },
    
        actions: {
            togglePage: function () {
                var self = this;
    
                this.toggleProperty('page');
                // If this is a new post.  Don't save the model.  Defer the save
                // to the user pressing the save button
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            toggleFeatured: function () {
                var self = this;
    
                this.toggleProperty('featured');
    
                // If this is a new post.  Don't save the model.  Defer the save
                // to the user pressing the save button
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save(this.get('saveOptions')).catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            /**
             * triggered by user manually changing slug
             */
            updateSlug: function (newSlug) {
                var slug = this.get('slug'),
                    self = this;
    
                newSlug = newSlug || slug;
    
                newSlug = newSlug && newSlug.trim();
    
                // Ignore unchanged slugs or candidate slugs that are empty
                if (!newSlug || slug === newSlug) {
                    // reset the input to its previous state
                    this.set('slugValue', slug);
    
                    return;
                }
    
                this.get('slugGenerator').generateSlug(newSlug).then(function (serverSlug) {
                    // If after getting the sanitized and unique slug back from the API
                    // we end up with a slug that matches the existing slug, abort the change
                    if (serverSlug === slug) {
                        return;
                    }
    
                    // Because the server transforms the candidate slug by stripping
                    // certain characters and appending a number onto the end of slugs
                    // to enforce uniqueness, there are cases where we can get back a
                    // candidate slug that is a duplicate of the original except for
                    // the trailing incrementor (e.g., this-is-a-slug and this-is-a-slug-2)
    
                    // get the last token out of the slug candidate and see if it's a number
                    var slugTokens = serverSlug.split('-'),
                        check = Number(slugTokens.pop());
    
                    // if the candidate slug is the same as the existing slug except
                    // for the incrementor then the existing slug should be used
                    if (isNumber(check) && check > 0) {
                        if (slug === slugTokens.join('-') && serverSlug !== newSlug) {
                            self.set('slugValue', slug);
    
                            return;
                        }
                    }
    
                    self.set('slug', serverSlug);
    
                    if (self.hasObserverFor('titleScratch')) {
                        self.removeObserver('titleScratch', self, 'titleObserver');
                    }
    
                    // If this is a new post.  Don't save the model.  Defer the save
                    // to the user pressing the save button
                    if (self.get('isNew')) {
                        return;
                    }
    
                    return self.get('model').save();
                }).catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            /**
             * Parse user's set published date.
             * Action sent by post settings menu view.
             * (#1351)
             */
            setPublishedAt: function (userInput) {
                var errMessage = '',
                    newPublishedAt = parseDateString(userInput),
                    publishedAt = this.get('published_at'),
                    self = this;
    
                if (!userInput) {
                    // Clear out the published_at field for a draft
                    if (this.get('isDraft')) {
                        this.set('published_at', null);
                    }
    
                    return;
                }
    
                // Validate new Published date
                if (!newPublishedAt.isValid()) {
                    errMessage = 'Published Date must be a valid date with format: ' +
                        'DD MMM YY @ HH:mm (e.g. 6 Dec 14 @ 15:00)';
                }
                if (newPublishedAt.diff(new Date(), 'h') > 0) {
                    errMessage = 'Published Date cannot currently be in the future.';
                }
    
                // If errors, notify and exit.
                if (errMessage) {
                    this.showErrors(errMessage);
    
                    return;
                }
    
                // Do nothing if the user didn't actually change the date
                if (publishedAt && publishedAt.isSame(newPublishedAt)) {
                    return;
                }
    
                // Validation complete
                this.set('published_at', newPublishedAt);
    
                // If this is a new post.  Don't save the model.  Defer the save
                // to the user pressing the save button
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            setMetaTitle: function (metaTitle) {
                var self = this,
                    currentTitle = this.get('meta_title') || '';
    
                // Only update if the title has changed
                if (currentTitle === metaTitle) {
                    return;
                }
    
                this.set('meta_title', metaTitle);
    
                // If this is a new post.  Don't save the model.  Defer the save
                // to the user pressing the save button
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                });
            },
    
            setMetaDescription: function (metaDescription) {
                var self = this,
                    currentDescription = this.get('meta_description') || '';
    
                // Only update if the description has changed
                if (currentDescription === metaDescription) {
                    return;
                }
    
                this.set('meta_description', metaDescription);
    
                // If this is a new post.  Don't save the model.  Defer the save
                // to the user pressing the save button
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                });
            },
    
            setCoverImage: function (image) {
                var self = this;
    
                this.set('image', image);
    
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            clearCoverImage: function () {
                var self = this;
    
                this.set('image', '');
    
                if (this.get('isNew')) {
                    return;
                }
    
                this.get('model').save().catch(function (errors) {
                    self.showErrors(errors);
                    self.get('model').rollback();
                });
            },
    
            showSubview: function () {
                this.set('isViewingSubview', true);
            },
    
            closeSubview: function () {
                this.set('isViewingSubview', false);
            },
    
            resetUploader: function () {
                var uploader = this.get('uploaderReference');
    
                if (uploader && uploader[0]) {
                    uploader[0].uploaderUi.reset();
                }
            }
        }
    });
    
    __exports__["default"] = PostSettingsMenuController;
  });
define("ghost/controllers/post-tags-input", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var PostTagsInputController = Ember.Controller.extend({
        tagEnteredOrder: Ember.A(),
    
        tags: Ember.computed('parentController.tags', function () {
            var proxyTags = Ember.ArrayProxy.create({
                content: this.get('parentController.tags')
            }),
            temp = proxyTags.get('arrangedContent').slice();
    
            proxyTags.get('arrangedContent').clear();
    
            this.get('tagEnteredOrder').forEach(function (tagName) {
                var tag = temp.find(function (tag) {
                    return tag.get('name') === tagName;
                });
    
                if (tag) {
                    proxyTags.get('arrangedContent').addObject(tag);
                    temp.removeObject(tag);
                }
            });
    
            proxyTags.get('arrangedContent').unshiftObjects(temp);
    
            return proxyTags;
        }),
    
        suggestions: null,
        newTagText: null,
    
        actions: {
            // triggered when the view is inserted so that later store.all('tag')
            // queries hit a full store cache and we don't see empty or out-of-date
            // suggestion lists
            loadAllTags: function () {
                this.store.find('tag');
            },
    
            addNewTag: function () {
                var newTagText = this.get('newTagText'),
                    searchTerm,
                    existingTags,
                    newTag;
    
                if (Ember.isEmpty(newTagText) || this.hasTag(newTagText)) {
                    this.send('reset');
                    return;
                }
    
                newTagText = newTagText.trim();
                searchTerm = newTagText.toLowerCase();
    
                // add existing tag if we have a match
                existingTags = this.store.all('tag').filter(function (tag) {
                    return tag.get('name').toLowerCase() === searchTerm;
                });
                if (existingTags.get('length')) {
                    this.send('addTag', existingTags.get('firstObject'));
                } else {
                    // otherwise create a new one
                    newTag = this.store.createRecord('tag');
                    newTag.set('name', newTagText);
    
                    this.send('addTag', newTag);
                }
    
                this.send('reset');
            },
    
            addTag: function (tag) {
                if (!Ember.isEmpty(tag)) {
                    this.get('tags').addObject(tag);
                    this.get('tagEnteredOrder').addObject(tag.get('name'));
                }
    
                this.send('reset');
            },
    
            deleteTag: function (tag) {
                if (tag) {
                    this.get('tags').removeObject(tag);
                    this.get('tagEnteredOrder').removeObject(tag.get('name'));
                }
            },
    
            deleteLastTag: function () {
                this.send('deleteTag', this.get('tags.lastObject'));
            },
    
            selectSuggestion: function (suggestion) {
                if (!Ember.isEmpty(suggestion)) {
                    this.get('suggestions').setEach('selected', false);
                    suggestion.set('selected', true);
                }
            },
    
            selectNextSuggestion: function () {
                var suggestions = this.get('suggestions'),
                    selectedSuggestion = this.get('selectedSuggestion'),
                    currentIndex,
                    newSelection;
    
                if (!Ember.isEmpty(suggestions)) {
                    currentIndex = suggestions.indexOf(selectedSuggestion);
                    if (currentIndex + 1 < suggestions.get('length')) {
                        newSelection = suggestions[currentIndex + 1];
                        this.send('selectSuggestion', newSelection);
                    } else {
                        suggestions.setEach('selected', false);
                    }
                }
            },
    
            selectPreviousSuggestion: function () {
                var suggestions = this.get('suggestions'),
                    selectedSuggestion = this.get('selectedSuggestion'),
                    currentIndex,
                    lastIndex,
                    newSelection;
    
                if (!Ember.isEmpty(suggestions)) {
                    currentIndex = suggestions.indexOf(selectedSuggestion);
                    if (currentIndex === -1) {
                        lastIndex = suggestions.get('length') - 1;
                        this.send('selectSuggestion', suggestions[lastIndex]);
                    } else if (currentIndex - 1 >= 0) {
                        newSelection = suggestions[currentIndex - 1];
                        this.send('selectSuggestion', newSelection);
                    } else {
                        suggestions.setEach('selected', false);
                    }
                }
            },
    
            addSelectedSuggestion: function () {
                var suggestion = this.get('selectedSuggestion');
    
                if (Ember.isEmpty(suggestion)) {
                    return;
                }
    
                this.send('addTag', suggestion.get('tag'));
            },
    
            reset: function () {
                this.set('suggestions', null);
                this.set('newTagText', null);
            }
        },
    
        selectedSuggestion: Ember.computed('suggestions.@each.selected', function () {
            var suggestions = this.get('suggestions');
    
            if (suggestions && suggestions.get('length')) {
                return suggestions.filterBy('selected').get('firstObject');
            } else {
                return null;
            }
        }),
    
        updateSuggestionsList: function () {
            var searchTerm = this.get('newTagText'),
                matchingTags,
                // Limit the suggestions number
                maxSuggestions = 5,
                suggestions = Ember.A();
    
            if (!searchTerm || Ember.isEmpty(searchTerm.trim())) {
                this.set('suggestions', null);
                return;
            }
    
            searchTerm = searchTerm.trim();
    
            matchingTags = this.findMatchingTags(searchTerm);
            matchingTags = matchingTags.slice(0, maxSuggestions);
            matchingTags.forEach(function (matchingTag) {
                var suggestion = this.makeSuggestionObject(matchingTag, searchTerm);
                suggestions.pushObject(suggestion);
            }, this);
    
            this.set('suggestions', suggestions);
        }.observes('newTagText'),
    
        findMatchingTags: function (searchTerm) {
            var matchingTags,
                self = this,
                allTags = this.store.all('tag'),
                deDupe = {};
    
            if (allTags.get('length') === 0) {
                return [];
            }
    
            searchTerm = searchTerm.toLowerCase();
    
            matchingTags = allTags.filter(function (tag) {
                var tagNameMatches,
                    hasAlreadyBeenAdded,
                    tagName = tag.get('name');
    
                tagNameMatches = tagName.toLowerCase().indexOf(searchTerm) !== -1;
                hasAlreadyBeenAdded = self.hasTag(tagName);
    
                if (tagNameMatches && !hasAlreadyBeenAdded) {
                    if (typeof deDupe[tagName] === 'undefined') {
                        deDupe[tagName] = 1;
                    } else {
                        deDupe[tagName] += 1;
                    }
                }
    
                return deDupe[tagName] === 1;
            });
    
            return matchingTags;
        },
    
        hasTag: function (tagName) {
            return this.get('tags').mapBy('name').contains(tagName);
        },
    
        makeSuggestionObject: function (matchingTag, _searchTerm) {
            var searchTerm = Ember.Handlebars.Utils.escapeExpression(_searchTerm),
                // jscs:disable
                regexEscapedSearchTerm = searchTerm.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'),
                // jscs:enable
                tagName = Ember.Handlebars.Utils.escapeExpression(matchingTag.get('name')),
                regex = new RegExp('(' + regexEscapedSearchTerm + ')', 'gi'),
                highlightedName,
                suggestion = Ember.Object.create();
    
            highlightedName = tagName.replace(regex, '<mark>$1</mark>');
            highlightedName = new Ember.Handlebars.SafeString(highlightedName);
    
            suggestion.set('tag', matchingTag);
            suggestion.set('highlightedName', highlightedName);
    
            return suggestion;
        }
    });
    
    __exports__["default"] = PostTagsInputController;
  });
define("ghost/controllers/posts", 
  ["ghost/mixins/pagination-controller","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var PaginationControllerMixin = __dependency1__["default"];

    
    function publishedAtCompare(item1, item2) {
        var published1 = item1.get('published_at'),
            published2 = item2.get('published_at');
    
        if (!published1 && !published2) {
            return 0;
        }
    
        if (!published1 && published2) {
            return -1;
        }
    
        if (!published2 && published1) {
            return 1;
        }
    
        return Ember.compare(published1.valueOf(), published2.valueOf());
    }
    
    var PostsController = Ember.ArrayController.extend(PaginationControllerMixin, {
        // See PostsRoute's shortcuts
        postListFocused: Ember.computed.equal('keyboardFocus', 'postList'),
        postContentFocused: Ember.computed.equal('keyboardFocus', 'postContent'),
        // this will cause the list to re-sort when any of these properties change on any of the models
        sortProperties: ['status', 'published_at', 'updated_at'],
    
        // override Ember.SortableMixin
        //
        // this function will keep the posts list sorted when loading individual/bulk
        // models from the server, even if records in between haven't been loaded.
        // this can happen when reloading the page on the Editor or PostsPost routes.
        //
        // a custom sort function is needed in order to sort the posts list the same way the server would:
        //     status: ASC
        //     published_at: DESC
        //     updated_at: DESC
        orderBy: function (item1, item2) {
            var updated1 = item1.get('updated_at'),
                updated2 = item2.get('updated_at'),
                statusResult,
                updatedAtResult,
                publishedAtResult;
    
            // when `updated_at` is undefined, the model is still
            // being written to with the results from the server
            if (item1.get('isNew') || !updated1) {
                return -1;
            }
    
            if (item2.get('isNew') || !updated2) {
                return 1;
            }
    
            statusResult = Ember.compare(item1.get('status'), item2.get('status'));
            updatedAtResult = Ember.compare(updated1.valueOf(), updated2.valueOf());
            publishedAtResult = publishedAtCompare(item1, item2);
    
            if (statusResult === 0) {
                if (publishedAtResult === 0) {
                    // This should be DESC
                    return updatedAtResult * -1;
                }
                // This should be DESC
                return publishedAtResult * -1;
            }
    
            return statusResult;
        },
    
        init: function () {
            // let the PaginationControllerMixin know what type of model we will be paginating
            // this is necesariy because we do not have access to the model inside the Controller::init method
            this._super({modelType: 'post'});
        }
    });
    
    __exports__["default"] = PostsController;
  });
define("ghost/controllers/posts/post", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var PostController = Ember.ObjectController.extend({
        isPublished: Ember.computed.equal('status', 'published'),
        classNameBindings: ['featured'],
    
        actions: {
            toggleFeatured: function () {
                var options = {disableNProgress: true},
                    self = this;
    
                this.toggleProperty('featured');
                this.get('model').save(options).catch(function (errors) {
                    self.notifications.showErrors(errors);
                });
            },
            showPostContent: function () {
                this.transitionToRoute('posts.post', this.get('model'));
            }
        }
    });
    
    __exports__["default"] = PostController;
  });
define("ghost/controllers/reset", 
  ["ghost/utils/ajax","ghost/mixins/validation-engine","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ajax = __dependency1__["default"];

    var ValidationEngine = __dependency2__["default"];

    
    var ResetController = Ember.Controller.extend(ValidationEngine, {
        newPassword: '',
        ne2Password: '',
        token: '',
        submitButtonDisabled: false,
    
        validationType: 'reset',
    
        email: Ember.computed('token', function () {
            // The token base64 encodes the email (and some other stuff),
            // each section is divided by a '|'. Email comes second.
            return atob(this.get('token')).split('|')[1];
        }),
    
        // Used to clear sensitive information
        clearData: function () {
            this.setProperties({
                newPassword: '',
                ne2Password: '',
                token: ''
            });
        },
    
        actions: {
            submit: function () {
                var credentials = this.getProperties('newPassword', 'ne2Password', 'token'),
                    self = this;
    
                this.toggleProperty('submitting');
                this.validate({format: false}).then(function () {
                    ajax({
                        url: self.get('ghostPaths.url').api('authentication', 'passwordreset'),
                        type: 'PUT',
                        data: {
                            passwordreset: [credentials]
                        }
                    }).then(function (resp) {
                        self.toggleProperty('submitting');
                        self.notifications.showSuccess(resp.passwordreset[0].message, true);
                        self.get('session').authenticate('simple-auth-authenticator:oauth2-password-grant', {
                            identification: self.get('email'),
                            password: credentials.newPassword
                        });
                    }).catch(function (response) {
                        self.notifications.showAPIError(response);
                        self.toggleProperty('submitting');
                    });
                }).catch(function (error) {
                    self.toggleProperty('submitting');
                    self.notifications.showErrors(error);
                });
            }
        }
    });
    
    __exports__["default"] = ResetController;
  });
define("ghost/controllers/settings", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SettingsController = Ember.Controller.extend({
        showGeneral: Ember.computed('session.user.name', function () {
            return this.get('session.user.isAuthor') || this.get('session.user.isEditor') ? false : true;
        }),
        showUsers: Ember.computed('session.user.name', function () {
            return this.get('session.user.isAuthor') ? false : true;
        }),
        showTags: Ember.computed('session.user.name', 'config.tagsUI', function () {
            return this.get('session.user.isAuthor') || !this.get('config.tagsUI') ? false : true;
        }),
    
        showCodeInjection: Ember.computed('session.user.name', 'config.codeInjectionUI', function () {
            return this.get('session.user.isAuthor') || this.get('session.user.isEditor') || !this.get('config.codeInjectionUI') ? false : true;
        }),
    
        showLabs: Ember.computed('session.user.name', function () {
            return this.get('session.user.isAuthor')  || this.get('session.user.isEditor') ? false : true;
        }),
    
        showAbout: Ember.computed('session.user.name', function () {
            return this.get('session.user.isAuthor') ? false : true;
        })
    });
    
    __exports__["default"] = SettingsController;
  });
define("ghost/controllers/settings/app", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*global alert */
    
    var appStates,
        SettingsAppController;
    
    appStates = {
        active: 'active',
        working: 'working',
        inactive: 'inactive'
    };
    
    SettingsAppController = Ember.ObjectController.extend({
        appState: appStates.active,
        buttonText: '',
    
        setAppState: function () {
            this.set('appState', this.get('active') ? appStates.active : appStates.inactive);
        }.on('init'),
    
        buttonTextSetter: function () {
            switch (this.get('appState')) {
                case appStates.active:
                    this.set('buttonText', 'Deactivate');
                    break;
                case appStates.inactive:
                    this.set('buttonText', 'Activate');
                    break;
                case appStates.working:
                    this.set('buttonText', 'Working');
                    break;
            }
        }.observes('appState').on('init'),
    
        activeClass: Ember.computed('appState', function () {
            return this.appState === appStates.active ? true : false;
        }),
    
        inactiveClass: Ember.computed('appState', function () {
            return this.appState === appStates.inactive ? true : false;
        }),
    
        actions: {
            toggleApp: function (app) {
                var self = this;
    
                this.set('appState', appStates.working);
    
                app.set('active', !app.get('active'));
    
                app.save().then(function () {
                    self.setAppState();
                })
                .then(function () {
                    alert('@TODO: Success');
                })
                .catch(function () {
                    alert('@TODO: Failure');
                });
            }
        }
    });
    
    __exports__["default"] = SettingsAppController;
  });
define("ghost/controllers/settings/code-injection", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SettingsCodeInjectionController = Ember.ObjectController.extend({
        actions: {
            save: function () {
                var self = this;
    
                return this.get('model').save().then(function (model) {
                    self.notifications.closePassive();
                    self.notifications.showSuccess('Settings successfully saved.');
    
                    return model;
                }).catch(function (errors) {
                    self.notifications.closePassive();
                    self.notifications.showErrors(errors);
                });
            }
        }
    });
    
    __exports__["default"] = SettingsCodeInjectionController;
  });
define("ghost/controllers/settings/general", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SettingsGeneralController = Ember.ObjectController.extend({
        isDatedPermalinks: Ember.computed('permalinks', function (key, value) {
            // setter
            if (arguments.length > 1) {
                this.set('permalinks', value ? '/:year/:month/:day/:slug/' : '/:slug/');
            }
    
            // getter
            var slugForm = this.get('permalinks');
    
            return slugForm !== '/:slug/';
        }),
    
        themes: Ember.computed(function () {
            return this.get('availableThemes').reduce(function (themes, t) {
                var theme = {};
    
                theme.name = t.name;
                theme.label = t.package ? t.package.name + ' - ' + t.package.version : t.name;
                theme.package = t.package;
                theme.active = !!t.active;
    
                themes.push(theme);
    
                return themes;
            }, []);
        }).readOnly(),
    
        actions: {
            save: function () {
                var self = this;
    
                return this.get('model').save().then(function (model) {
                    self.notifications.showSuccess('Settings successfully saved.');
    
                    return model;
                }).catch(function (errors) {
                    self.notifications.showErrors(errors);
                });
            },
    
            checkPostsPerPage: function () {
                if (this.get('postsPerPage') < 1 || this.get('postsPerPage') > 1000 || isNaN(this.get('postsPerPage'))) {
                    this.set('postsPerPage', 5);
                }
            }
        }
    });
    
    __exports__["default"] = SettingsGeneralController;
  });
define("ghost/controllers/settings/labs", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var LabsController = Ember.Controller.extend(Ember.Evented, {
        uploadButtonText: 'Import',
        importErrors: '',
    
        actions: {
            onUpload: function (file) {
                var self = this,
                    formData = new FormData();
    
                this.set('uploadButtonText', 'Importing');
                this.set('importErrors', '');
                this.notifications.closePassive();
    
                formData.append('importfile', file);
    
                ic.ajax.request(this.get('ghostPaths.url').api('db'), {
                    type: 'POST',
                    data: formData,
                    dataType: 'json',
                    cache: false,
                    contentType: false,
                    processData: false
                }).then(function () {
                    self.notifications.showSuccess('Import successful.');
                }).catch(function (response) {
                    if (response && response.jqXHR && response.jqXHR.responseJSON && response.jqXHR.responseJSON.errors) {
                        self.set('importErrors', response.jqXHR.responseJSON.errors);
                    }
    
                    self.notifications.showError('Import Failed');
                }).finally(function () {
                    self.set('uploadButtonText', 'Import');
                    self.trigger('reset');
                });
            },
    
            exportData: function () {
                var iframe = $('#iframeDownload'),
                    downloadURL = this.get('ghostPaths.url').api('db') +
                        '?access_token=' + this.get('session.access_token');
    
                if (iframe.length === 0) {
                    iframe = $('<iframe>', {id: 'iframeDownload'}).hide().appendTo('body');
                }
    
                iframe.attr('src', downloadURL);
            },
    
            sendTestEmail: function () {
                var self = this;
    
                ic.ajax.request(this.get('ghostPaths.url').api('mail', 'test'), {
                    type: 'POST'
                }).then(function () {
                    self.notifications.showSuccess('Check your email for the test message.');
                }).catch(function (error) {
                    if (typeof error.jqXHR !== 'undefined') {
                        self.notifications.showAPIError(error);
                    } else {
                        self.notifications.showErrors(error);
                    }
                });
            }
        }
    });
    
    __exports__["default"] = LabsController;
  });
define("ghost/controllers/settings/tags", 
  ["ghost/mixins/pagination-controller","ghost/utils/bound-one-way","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var PaginationMixin = __dependency1__["default"];

    var boundOneWay = __dependency2__["default"];

    
    var TagsController = Ember.ArrayController.extend(PaginationMixin, {
        tags: Ember.computed.alias('model'),
    
        needs: 'application',
    
        activeTag: null,
        activeTagNameScratch: boundOneWay('activeTag.name'),
        activeTagSlugScratch: boundOneWay('activeTag.slug'),
        activeTagDescriptionScratch: boundOneWay('activeTag.description'),
        activeTagMetaTitleScratch: boundOneWay('activeTag.meta_title'),
        activeTagMetaDescriptionScratch: boundOneWay('activeTag.meta_description'),
    
        init: function (options) {
            options = options || {};
            options.modelType = 'tag';
            this._super(options);
        },
    
        isViewingSubview: Ember.computed('controllers.application.showSettingsMenu', function (key, value) {
            // Not viewing a subview if we can't even see the PSM
            if (!this.get('controllers.application.showSettingsMenu')) {
                return false;
            }
            if (arguments.length > 1) {
                return value;
            }
    
            return false;
        }),
    
        showErrors: function (errors) {
            errors = Ember.isArray(errors) ? errors : [errors];
            this.notifications.showErrors(errors);
        },
    
        saveActiveTagProperty: function (propKey, newValue) {
            var activeTag = this.get('activeTag'),
                currentValue = activeTag.get(propKey),
                self = this;
    
            newValue = newValue.trim();
    
            // Quit if there was no change
            if (newValue === currentValue) {
                return;
            }
    
            activeTag.set(propKey, newValue);
    
            this.notifications.closePassive();
    
            activeTag.save().catch(function (errors) {
                self.showErrors(errors);
            });
        },
    
        seoTitle: Ember.computed('scratch', 'activeTagNameScratch', 'activeTagMetaTitleScratch', function () {
            var metaTitle = this.get('activeTagMetaTitleScratch') || '';
    
            metaTitle = metaTitle.length > 0 ? metaTitle : this.get('activeTagNameScratch');
    
            if (metaTitle && metaTitle.length > 70) {
                metaTitle = metaTitle.substring(0, 70).trim();
                metaTitle = Ember.Handlebars.Utils.escapeExpression(metaTitle);
                metaTitle = new Ember.Handlebars.SafeString(metaTitle + '&hellip;');
            }
    
            return metaTitle;
        }),
    
        seoURL: Ember.computed('activeTagSlugScratch', function () {
            var blogUrl = this.get('config').blogUrl,
                seoSlug = this.get('activeTagSlugScratch') ? this.get('activeTagSlugScratch') : '',
                seoURL = blogUrl + '/tag/' + seoSlug;
    
            // only append a slash to the URL if the slug exists
            if (seoSlug) {
                seoURL += '/';
            }
    
            if (seoURL.length > 70) {
                seoURL = seoURL.substring(0, 70).trim();
                seoURL = new Ember.Handlebars.SafeString(seoURL + '&hellip;');
            }
    
            return seoURL;
        }),
    
        seoDescription: Ember.computed('scratch', 'activeTagDescriptionScratch', 'activeTagMetaDescriptionScratch', function () {
            var metaDescription = this.get('activeTagMetaDescriptionScratch') || '';
    
            metaDescription = metaDescription.length > 0 ? metaDescription : this.get('activeTagDescriptionScratch');
    
            if (metaDescription && metaDescription.length > 156) {
                metaDescription = metaDescription.substring(0, 156).trim();
                metaDescription = Ember.Handlebars.Utils.escapeExpression(metaDescription);
                metaDescription = new Ember.Handlebars.SafeString(metaDescription + '&hellip;');
            }
    
            return metaDescription;
        }),
    
        actions: {
            newTag: function () {
                this.set('activeTag', this.store.createRecord('tag'));
                this.send('openSettingsMenu');
            },
    
            editTag: function (tag) {
                this.set('activeTag', tag);
                this.send('openSettingsMenu');
            },
    
            deleteTag: function (tag) {
                var name = tag.get('name'),
                    self = this;
    
                this.send('closeSettingsMenu');
    
                tag.destroyRecord().then(function () {
                    self.notifications.showSuccess('Deleted ' + name);
                }).catch(function (error) {
                    self.notifications.showAPIError(error);
                });
            },
    
            saveActiveTagName: function (name) {
                this.saveActiveTagProperty('name', name);
            },
    
            saveActiveTagSlug: function (slug) {
                this.saveActiveTagProperty('slug', slug);
            },
    
            saveActiveTagDescription: function (description) {
                this.saveActiveTagProperty('description', description);
            },
    
            saveActiveTagMetaTitle: function (metaTitle) {
                this.saveActiveTagProperty('meta_title', metaTitle);
            },
    
            saveActiveTagMetaDescription: function (metaDescription) {
                this.saveActiveTagProperty('meta_description', metaDescription);
            },
    
            showSubview: function () {
                this.set('isViewingSubview', true);
            },
    
            closeSubview: function () {
                this.set('isViewingSubview', false);
            },
    
            setCoverImage: function (image) {
                this.saveActiveTagProperty('image', image);
            },
    
            clearCoverImage: function () {
                this.saveActiveTagProperty('image', '');
            }
        }
    });
    
    __exports__["default"] = TagsController;
  });
define("ghost/controllers/settings/users/index", 
  ["ghost/mixins/pagination-controller","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var PaginationControllerMixin = __dependency1__["default"];

    
    var UsersIndexController = Ember.ArrayController.extend(PaginationControllerMixin, {
        init: function () {
            // let the PaginationControllerMixin know what type of model we will be paginating
            // this is necessary because we do not have access to the model inside the Controller::init method
            this._super({modelType: 'user'});
        },
    
        users: Ember.computed.alias('model'),
    
        activeUsers: Ember.computed.filter('users', function (user) {
            return /^active|warn-[1-4]|locked$/.test(user.get('status'));
        }),
    
        invitedUsers: Ember.computed.filter('users', function (user) {
            var status = user.get('status');
    
            return status === 'invited' || status === 'invited-pending';
        })
    });
    
    __exports__["default"] = UsersIndexController;
  });
define("ghost/controllers/settings/users/user", 
  ["ghost/models/slug-generator","ghost/utils/isNumber","ghost/utils/bound-one-way","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var SlugGenerator = __dependency1__["default"];

    var isNumber = __dependency2__["default"];

    var boundOneWay = __dependency3__["default"];

    
    var SettingsUserController = Ember.ObjectController.extend({
    
        user: Ember.computed.alias('model'),
    
        email: Ember.computed.readOnly('user.email'),
    
        slugValue: boundOneWay('user.slug'),
    
        lastPromise: null,
    
        coverDefault: Ember.computed('ghostPaths', function () {
            return this.get('ghostPaths.url').asset('/shared/img/user-cover.png');
        }),
    
        userDefault: Ember.computed('ghostPaths', function () {
            return this.get('ghostPaths.url').asset('/shared/img/user-image.png');
        }),
    
        cover: Ember.computed('user.cover', 'coverDefault', function () {
            var cover = this.get('user.cover');
    
            if (Ember.isBlank(cover)) {
                cover = this.get('coverDefault');
            }
    
            return 'background-image: url(' + cover + ')';
        }),
    
        coverTitle: Ember.computed('user.name', function () {
            return this.get('user.name') + '\'s Cover Image';
        }),
    
        image: Ember.computed('imageUrl', function () {
            return 'background-image: url(' + this.get('imageUrl') + ')';
        }),
    
        imageUrl: Ember.computed('user.image', function () {
            return this.get('user.image') || this.get('userDefault');
        }),
    
        last_login: Ember.computed('user.last_login', function () {
            var lastLogin = this.get('user.last_login');
    
            return lastLogin ? lastLogin.fromNow() : '(Never)';
        }),
    
        created_at: Ember.computed('user.created_at', function () {
            var createdAt = this.get('user.created_at');
    
            return createdAt ? createdAt.fromNow() : '';
        }),
    
        // Lazy load the slug generator for slugPlaceholder
        slugGenerator: Ember.computed(function () {
            return SlugGenerator.create({
                ghostPaths: this.get('ghostPaths'),
                slugType: 'user'
            });
        }),
    
        actions: {
            changeRole: function (newRole) {
                this.set('model.role', newRole);
            },
    
            revoke: function () {
                var self = this,
                    model = this.get('model'),
                    email = this.get('email');
    
                // reload the model to get the most up-to-date user information
                model.reload().then(function () {
                    if (self.get('invited')) {
                        model.destroyRecord().then(function () {
                            var notificationText = 'Invitation revoked. (' + email + ')';
                            self.notifications.showSuccess(notificationText, false);
                        }).catch(function (error) {
                            self.notifications.showAPIError(error);
                        });
                    } else {
                        // if the user is no longer marked as "invited", then show a warning and reload the route
                        self.get('target').send('reload');
                        self.notifications.showError('This user has already accepted the invitation.', {delayed: 500});
                    }
                });
            },
    
            resend: function () {
                var self = this;
    
                this.get('model').resendInvite().then(function (result) {
                    var notificationText = 'Invitation resent! (' + self.get('email') + ')';
                    // If sending the invitation email fails, the API will still return a status of 201
                    // but the user's status in the response object will be 'invited-pending'.
                    if (result.users[0].status === 'invited-pending') {
                        self.notifications.showWarn('Invitation email was not sent.  Please try resending.');
                    } else {
                        self.get('model').set('status', result.users[0].status);
                        self.notifications.showSuccess(notificationText);
                    }
                }).catch(function (error) {
                    self.notifications.showAPIError(error);
                });
            },
    
            save: function () {
                var user = this.get('user'),
                    slugValue = this.get('slugValue'),
                    afterUpdateSlug = this.get('lastPromise'),
                    promise,
                    slugChanged,
                    self = this;
    
                if (user.get('slug') !== slugValue) {
                    slugChanged = true;
                    user.set('slug', slugValue);
                }
    
                promise = Ember.RSVP.resolve(afterUpdateSlug).then(function () {
                    return user.save({format: false});
                }).then(function (model) {
                    var currentPath,
                        newPath;
    
                    self.notifications.showSuccess('Settings successfully saved.');
    
                    // If the user's slug has changed, change the URL and replace
                    // the history so refresh and back button still work
                    if (slugChanged) {
                        currentPath = window.history.state.path;
    
                        newPath = currentPath.split('/');
                        newPath[newPath.length - 2] = model.get('slug');
                        newPath = newPath.join('/');
    
                        window.history.replaceState({path: newPath}, '', newPath);
                    }
    
                    return model;
                }).catch(function (errors) {
                    self.notifications.showErrors(errors);
                });
    
                this.set('lastPromise', promise);
            },
    
            password: function () {
                var user = this.get('user'),
                    self = this;
    
                if (user.get('isPasswordValid')) {
                    user.saveNewPassword().then(function (model) {
                        // Clear properties from view
                        user.setProperties({
                            password: '',
                            newPassword: '',
                            ne2Password: ''
                        });
    
                        self.notifications.showSuccess('Password updated.');
    
                        return model;
                    }).catch(function (errors) {
                        self.notifications.showAPIError(errors);
                    });
                } else {
                    self.notifications.showErrors(user.get('passwordValidationErrors'));
                }
            },
    
            updateSlug: function (newSlug) {
                var self = this,
                    afterSave = this.get('lastPromise'),
                    promise;
    
                promise = Ember.RSVP.resolve(afterSave).then(function () {
                    var slug = self.get('slug');
    
                    newSlug = newSlug || slug;
    
                    newSlug = newSlug.trim();
    
                    // Ignore unchanged slugs or candidate slugs that are empty
                    if (!newSlug || slug === newSlug) {
                        self.set('slugValue', slug);
    
                        return;
                    }
    
                    return self.get('slugGenerator').generateSlug(newSlug).then(function (serverSlug) {
                        // If after getting the sanitized and unique slug back from the API
                        // we end up with a slug that matches the existing slug, abort the change
                        if (serverSlug === slug) {
                            return;
                        }
    
                        // Because the server transforms the candidate slug by stripping
                        // certain characters and appending a number onto the end of slugs
                        // to enforce uniqueness, there are cases where we can get back a
                        // candidate slug that is a duplicate of the original except for
                        // the trailing incrementor (e.g., this-is-a-slug and this-is-a-slug-2)
    
                        // get the last token out of the slug candidate and see if it's a number
                        var slugTokens = serverSlug.split('-'),
                            check = Number(slugTokens.pop());
    
                        // if the candidate slug is the same as the existing slug except
                        // for the incrementor then the existing slug should be used
                        if (isNumber(check) && check > 0) {
                            if (slug === slugTokens.join('-') && serverSlug !== newSlug) {
                                self.set('slugValue', slug);
    
                                return;
                            }
                        }
    
                        self.set('slugValue', serverSlug);
                    });
                });
    
                this.set('lastPromise', promise);
            }
        }
    });
    
    __exports__["default"] = SettingsUserController;
  });
define("ghost/controllers/setup", 
  ["ghost/utils/ajax","ghost/mixins/validation-engine","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ajax = __dependency1__["default"];

    var ValidationEngine = __dependency2__["default"];

    
    var SetupController = Ember.ObjectController.extend(ValidationEngine, {
        blogTitle: null,
        name: null,
        email: null,
        password: null,
        submitting: false,
    
        // ValidationEngine settings
        validationType: 'setup',
    
        actions: {
            setup: function () {
                var self = this,
                    data = self.getProperties('blogTitle', 'name', 'email', 'password');
    
                self.notifications.closePassive();
    
                this.toggleProperty('submitting');
                this.validate({format: false}).then(function () {
                    ajax({
                        url: self.get('ghostPaths.url').api('authentication', 'setup'),
                        type: 'POST',
                        data: {
                            setup: [{
                                name: data.name,
                                email: data.email,
                                password: data.password,
                                blogTitle: data.blogTitle
                            }]
                        }
                    }).then(function () {
                        self.get('session').authenticate('simple-auth-authenticator:oauth2-password-grant', {
                            identification: self.get('email'),
                            password: self.get('password')
                        });
                    }).catch(function (resp) {
                        self.toggleProperty('submitting');
                        self.notifications.showAPIError(resp);
                    });
                }).catch(function (errors) {
                    self.toggleProperty('submitting');
                    self.notifications.showErrors(errors);
                });
            }
        }
    });
    
    __exports__["default"] = SetupController;
  });
define("ghost/controllers/signin", 
  ["ghost/mixins/validation-engine","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ValidationEngine = __dependency1__["default"];

    
    var SigninController = Ember.Controller.extend(SimpleAuth.AuthenticationControllerMixin, ValidationEngine, {
        authenticator: 'simple-auth-authenticator:oauth2-password-grant',
    
        validationType: 'signin',
    
        actions: {
            authenticate: function () {
                var data = this.getProperties('identification', 'password');
    
                return this._super(data);
            },
    
            validateAndAuthenticate: function () {
                var self = this;
    
                this.validate({format: false}).then(function () {
                    self.notifications.closePassive();
                    self.send('authenticate');
                }).catch(function (errors) {
                    self.notifications.showErrors(errors);
                });
            }
        }
    });
    
    __exports__["default"] = SigninController;
  });
define("ghost/controllers/signup", 
  ["ghost/utils/ajax","ghost/mixins/validation-engine","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ajax = __dependency1__["default"];

    var ValidationEngine = __dependency2__["default"];

    
    var SignupController = Ember.ObjectController.extend(ValidationEngine, {
        submitting: false,
    
        // ValidationEngine settings
        validationType: 'signup',
    
        actions: {
            signup: function () {
                var self = this,
                    data = self.getProperties('name', 'email', 'password', 'token');
    
                self.notifications.closePassive();
    
                this.toggleProperty('submitting');
                this.validate({format: false}).then(function () {
                    ajax({
                        url: self.get('ghostPaths.url').api('authentication', 'invitation'),
                        type: 'POST',
                        dataType: 'json',
                        data: {
                            invitation: [{
                                name: data.name,
                                email: data.email,
                                password: data.password,
                                token: data.token
                            }]
                        }
                    }).then(function () {
                        self.get('session').authenticate('simple-auth-authenticator:oauth2-password-grant', {
                            identification: self.get('email'),
                            password: self.get('password')
                        });
                    }, function (resp) {
                        self.toggleProperty('submitting');
                        self.notifications.showAPIError(resp);
                    });
                }, function (errors) {
                    self.toggleProperty('submitting');
                    self.notifications.showErrors(errors);
                });
            }
        }
    });
    
    __exports__["default"] = SignupController;
  });
define("ghost/docs/js/nav", 
  [],
  function() {
    "use strict";
    (function(){
    
        // TODO: unbind click events when nav is desktop sized
    
        // Element vars
        var menu_button = document.querySelector(".menu-button"),
            viewport = document.querySelector(".viewport"),
            global_nav = document.querySelector(".global-nav"),
            page_content = document.querySelector(".viewport .page-content");
    
        // mediaQuery listener
        var mq_max_1025 = window.matchMedia("(max-width: 1025px)");
        mq_max_1025.addListener(show_hide_nav);
        show_hide_nav(mq_max_1025);
    
        menu_button.addEventListener("click", function(e) {
            e.preventDefault();
            if (menu_button.getAttribute('data-nav-open')) {
                close_nav();
            } else {
                open_nav();
            }
        });
    
        page_content.addEventListener("click", function(e) {
            e.preventDefault();
            console.log("click viewport");
            if (viewport.classList.contains("global-nav-expanded")) {
                console.log("close nav from viewport");
                close_nav();
            }
        });
    
        var open_nav = function(){
            menu_button.setAttribute("data-nav-open", "true");
            viewport.classList.add("global-nav-expanded");
            global_nav.classList.add("global-nav-expanded");
        };
    
        var close_nav = function(){
            menu_button.removeAttribute('data-nav-open');
            viewport.classList.remove("global-nav-expanded");
            global_nav.classList.remove("global-nav-expanded");
        };
    
        function show_hide_nav(mq) {
            if (mq.matches) {
                // Window is 1025px or less
            } else {
                // Window is 1026px or more
                viewport.classList.remove("global-nav-expanded");
                global_nav.classList.remove("global-nav-expanded");
            }
        }
    
    })();
  });
define("ghost/helpers/gh-blog-url", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var blogUrl = Ember.Handlebars.makeBoundHelper(function () {
        return new Ember.Handlebars.SafeString(this.get('config.blogUrl'));
    });
    
    __exports__["default"] = blogUrl;
  });
define("ghost/helpers/gh-count-characters", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var countCharacters = Ember.Handlebars.makeBoundHelper(function (content) {
        var el = document.createElement('span'),
            length = content ? content.length : 0;
    
        el.className = 'word-count';
    
        if (length > 180) {
            el.style.color = '#E25440';
        } else {
            el.style.color = '#9E9D95';
        }
    
        el.innerHTML = 200 - length;
    
        return new Ember.Handlebars.SafeString(el.outerHTML);
    });
    
    __exports__["default"] = countCharacters;
  });
define("ghost/helpers/gh-count-down-characters", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var countDownCharacters = Ember.Handlebars.makeBoundHelper(function (content, maxCharacters) {
        var el = document.createElement('span'),
            length = content ? content.length : 0;
    
        el.className = 'word-count';
    
        if (length > maxCharacters) {
            el.style.color = '#E25440';
        } else {
            el.style.color = '#9FBB58';
        }
    
        el.innerHTML = length;
    
        return new Ember.Handlebars.SafeString(el.outerHTML);
    });
    
    __exports__["default"] = countDownCharacters;
  });
define("ghost/helpers/gh-count-words", 
  ["ghost/utils/word-count","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var counter = __dependency1__["default"];

    
    var countWords = Ember.Handlebars.makeBoundHelper(function (markdown) {
        if (/^\s*$/.test(markdown)) {
            return '0 words';
        }
    
        var count = counter(markdown || '');
    
        return count + (count === 1 ? ' word' : ' words');
    });
    
    __exports__["default"] = countWords;
  });
define("ghost/helpers/gh-format-html", 
  ["ghost/utils/caja-sanitizers","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global Handlebars, html_sanitize*/
    var cajaSanitizers = __dependency1__["default"];

    
    var formatHTML = Ember.Handlebars.makeBoundHelper(function (html) {
        var escapedhtml = html || '';
    
        // replace script and iFrame
        // jscs:disable
        escapedhtml = escapedhtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            '<pre class="js-embed-placeholder">Embedded JavaScript</pre>');
        escapedhtml = escapedhtml.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            '<pre class="iframe-embed-placeholder">Embedded iFrame</pre>');
        // jscs:enable
    
        // sanitize HTML
        // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
        escapedhtml = html_sanitize(escapedhtml, cajaSanitizers.url, cajaSanitizers.id);
        // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
    
        return new Handlebars.SafeString(escapedhtml);
    });
    
    __exports__["default"] = formatHTML;
  });
define("ghost/helpers/gh-format-markdown", 
  ["ghost/utils/caja-sanitizers","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global Showdown, Handlebars, html_sanitize*/
    var cajaSanitizers = __dependency1__["default"];

    
    var showdown,
        formatMarkdown;
    
    showdown = new Showdown.converter({extensions: ['ghostimagepreview', 'ghostgfm', 'footnotes', 'highlight']});
    
    formatMarkdown = Ember.Handlebars.makeBoundHelper(function (markdown) {
        var escapedhtml = '';
    
        // convert markdown to HTML
        escapedhtml = showdown.makeHtml(markdown || '');
    
        // replace script and iFrame
        // jscs:disable
        escapedhtml = escapedhtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            '<pre class="js-embed-placeholder">Embedded JavaScript</pre>');
        escapedhtml = escapedhtml.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            '<pre class="iframe-embed-placeholder">Embedded iFrame</pre>');
        // jscs:enable
    
        // sanitize html
        // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
        escapedhtml = html_sanitize(escapedhtml, cajaSanitizers.url, cajaSanitizers.id);
        // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
    
        return new Handlebars.SafeString(escapedhtml);
    });
    
    __exports__["default"] = formatMarkdown;
  });
define("ghost/helpers/gh-format-timeago", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global moment */
    var formatTimeago = Ember.Handlebars.makeBoundHelper(function (timeago) {
        return moment(timeago).fromNow();
        // stefanpenner says cool for small number of timeagos.
        // For large numbers moment sucks => single Ember.Object based clock better
        // https://github.com/manuelmitasch/ghost-admin-ember-demo/commit/fba3ab0a59238290c85d4fa0d7c6ed1be2a8a82e#commitcomment-5396524
    });
    
    __exports__["default"] = formatTimeago;
  });
define("ghost/helpers/ghost-paths", 
  ["ghost/utils/ghost-paths","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    // Handlebars Helper {{gh-path}}
    // Usage: Assume 'http://www.myghostblog.org/myblog/'
    // {{gh-path}} or {{gh-path ‘blog’}} for Ghost’s root (/myblog/)
    // {{gh-path ‘admin’}} for Ghost’s admin root (/myblog/ghost/)
    // {{gh-path ‘api’}} for Ghost’s api root (/myblog/ghost/api/v0.1/)
    // {{gh-path 'admin' '/assets/hi.png'}} for resolved url (/myblog/ghost/assets/hi.png)
    var ghostPaths = __dependency1__["default"];

    
    function ghostPathsHelper(path, url) {
        var base,
            argsLength = arguments.length,
            paths = ghostPaths();
    
        // function is always invoked with at least one parameter, so if
        // arguments.length is 1 there were 0 arguments passed in explicitly
        if (argsLength === 1) {
            path = 'blog';
        } else if (argsLength === 2 && !/^(blog|admin|api)$/.test(path)) {
            url = path;
            path = 'blog';
        }
    
        switch (path.toString()) {
            case 'blog':
                base = paths.blogRoot;
                break;
            case 'admin':
                base = paths.adminRoot;
                break;
            case 'api':
                base = paths.apiRoot;
                break;
            default:
                base = paths.blogRoot;
                break;
        }
    
        // handle leading and trailing slashes
    
        base = base[base.length - 1] !== '/' ? base + '/' : base;
    
        if (url && url.length > 0) {
            if (url[0] === '/') {
                url = url.substr(1);
            }
    
            base = base + url;
        }
    
        return new Ember.Handlebars.SafeString(base);
    }
    
    __exports__["default"] = ghostPathsHelper;
  });
define("ghost/initializers/authentication", 
  ["ghost/utils/ghost-paths","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ghostPaths = __dependency1__["default"];

    
    var Ghost,
        AuthenticationInitializer;
    
    Ghost = ghostPaths();
    
    AuthenticationInitializer = {
        name: 'authentication',
        before: 'simple-auth',
        after: 'registerTrailingLocationHistory',
    
        initialize: function (container) {
            window.ENV = window.ENV || {};
    
            window.ENV['simple-auth'] = {
                authenticationRoute: 'signin',
                routeAfterAuthentication: 'posts',
                authorizer: 'simple-auth-authorizer:oauth2-bearer',
                localStorageKey: 'ghost' + (Ghost.subdir.indexOf('/') === 0 ? '-' + Ghost.subdir.substr(1) : '') + ':session'
            };
    
            window.ENV['simple-auth-oauth2'] = {
                serverTokenEndpoint: Ghost.apiRoot + '/authentication/token',
                serverTokenRevocationEndpoint: Ghost.apiRoot + '/authentication/revoke',
                refreshAccessTokens: true
            };
    
            SimpleAuth.Session.reopen({
                user: Ember.computed(function () {
                    return container.lookup('store:main').find('user', 'me');
                })
            });
    
            SimpleAuth.Authenticators.OAuth2.reopen({
                makeRequest: function (url, data) {
                    data.client_id = 'ghost-admin';
                    return this._super(url, data);
                }
            });
        }
    };
    
    __exports__["default"] = AuthenticationInitializer;
  });
define("ghost/initializers/dropdown", 
  ["ghost/utils/dropdown-service","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var DropdownService = __dependency1__["default"];

    
    var dropdownInitializer = {
        name: 'dropdown',
    
        initialize: function (container, application) {
            application.register('dropdown:service', DropdownService);
    
            // Inject dropdowns
            application.inject('component:gh-dropdown', 'dropdown', 'dropdown:service');
            application.inject('component:gh-dropdown-button', 'dropdown', 'dropdown:service');
            application.inject('controller:modals.delete-post', 'dropdown', 'dropdown:service');
            application.inject('controller:modals.transfer-owner', 'dropdown', 'dropdown:service');
            application.inject('route:application', 'dropdown', 'dropdown:service');
    
            // Inject popovers
            application.inject('component:gh-popover', 'dropdown', 'dropdown:service');
            application.inject('component:gh-popover-button', 'dropdown', 'dropdown:service');
            application.inject('route:application', 'dropdown', 'dropdown:service');
        }
    };
    
    __exports__["default"] = dropdownInitializer;
  });
define("ghost/initializers/ghost-config", 
  ["ghost/utils/config-parser","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var getConfig = __dependency1__["default"];

    
    var ConfigInitializer = {
        name: 'config',
    
        initialize: function (container, application) {
            var config = getConfig();
            application.register('ghost:config', config, {instantiate: false});
    
            application.inject('route', 'config', 'ghost:config');
            application.inject('controller', 'config', 'ghost:config');
            application.inject('component', 'config', 'ghost:config');
        }
    };
    
    __exports__["default"] = ConfigInitializer;
  });
define("ghost/initializers/ghost-paths", 
  ["ghost/utils/ghost-paths","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ghostPaths = __dependency1__["default"];

    
    var ghostPathsInitializer = {
        name: 'ghost-paths',
        after: 'store',
    
        initialize: function (container, application) {
            application.register('ghost:paths', ghostPaths(), {instantiate: false});
    
            application.inject('route', 'ghostPaths', 'ghost:paths');
            application.inject('model', 'ghostPaths', 'ghost:paths');
            application.inject('controller', 'ghostPaths', 'ghost:paths');
        }
    };
    
    __exports__["default"] = ghostPathsInitializer;
  });
define("ghost/initializers/notifications", 
  ["ghost/utils/notifications","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Notifications = __dependency1__["default"];

    
    var injectNotificationsInitializer = {
        name: 'injectNotifications',
        before: 'authentication',
    
        initialize: function (container, application) {
            application.register('notifications:main', Notifications);
    
            application.inject('controller', 'notifications', 'notifications:main');
            application.inject('component', 'notifications', 'notifications:main');
            application.inject('router', 'notifications', 'notifications:main');
            application.inject('route', 'notifications', 'notifications:main');
        }
    };
    
    __exports__["default"] = injectNotificationsInitializer;
  });
define("ghost/initializers/store-injector", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var StoreInjector = {
        name: 'store-injector',
        after: 'store',
    
        initialize: function (container, application) {
            application.inject('component:gh-role-selector', 'store', 'store:main');
        }
    };
    
    __exports__["default"] = StoreInjector;
  });
define("ghost/initializers/trailing-history", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*global Ember */
    
    var trailingHistory,
        registerTrailingLocationHistory;
    
    trailingHistory = Ember.HistoryLocation.extend({
        formatURL: function () {
            // jscs: disable
            return this._super.apply(this, arguments).replace(/\/?$/, '/');
            // jscs: enable
        }
    });
    
    registerTrailingLocationHistory = {
        name: 'registerTrailingLocationHistory',
    
        initialize: function (container, application) {
            application.register('location:trailing-history', trailingHistory);
        }
    };
    
    __exports__["default"] = registerTrailingLocationHistory;
  });
define("ghost/mixins/body-event-listener", 
  ["exports"],
  function(__exports__) {
    "use strict";
    
    // Code modified from Addepar/ember-widgets
    // https://github.com/Addepar/ember-widgets/blob/master/src/mixins.coffee#L39
    
    var BodyEventListener = Ember.Mixin.create({
        bodyElementSelector: 'html',
        bodyClick: Ember.K,
    
        init: function () {
            this._super();
    
            return Ember.run.next(this, this._setupDocumentHandlers);
        },
    
        willDestroy: function () {
            this._super();
    
            return this._removeDocumentHandlers();
        },
    
        _setupDocumentHandlers: function () {
            if (this._clickHandler) {
                return;
            }
    
            var self = this;
    
            this._clickHandler = function () {
                return self.bodyClick();
            };
    
            return $(this.get('bodyElementSelector')).on('click', this._clickHandler);
        },
    
        _removeDocumentHandlers: function () {
            $(this.get('bodyElementSelector')).off('click', this._clickHandler);
            this._clickHandler = null;
        },
    
        // http://stackoverflow.com/questions/152975/how-to-detect-a-click-outside-an-element
        click: function (event) {
            return event.stopPropagation();
        }
    });
    
    __exports__["default"] = BodyEventListener;
  });
define("ghost/mixins/current-user-settings", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var CurrentUserSettings = Ember.Mixin.create({
        currentUser: function () {
            return this.store.find('user', 'me');
        },
    
        transitionAuthor: function () {
            var self = this;
    
            return function (user) {
                if (user.get('isAuthor')) {
                    return self.transitionTo('settings.users.user', user);
                }
    
                return user;
            };
        },
    
        transitionEditor: function () {
            var self = this;
    
            return function (user) {
                if (user.get('isEditor')) {
                    return self.transitionTo('settings.users');
                }
    
                return user;
            };
        }
    });
    
    __exports__["default"] = CurrentUserSettings;
  });
define("ghost/mixins/dropdown-mixin", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /*
      Dropdowns and their buttons are evented and do not propagate clicks.
    */
    var DropdownMixin = Ember.Mixin.create(Ember.Evented, {
        classNameBindings: ['isOpen:open:closed'],
        isOpen: false,
    
        click: function (event) {
            this._super(event);
    
            return event.stopPropagation();
        }
    });
    
    __exports__["default"] = DropdownMixin;
  });
define("ghost/mixins/editor-base-controller", 
  ["ghost/mixins/marker-manager","ghost/models/post","ghost/utils/bound-one-way","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    /* global console */
    var MarkerManager = __dependency1__["default"];

    var PostModel = __dependency2__["default"];

    var boundOneWay = __dependency3__["default"];

    
    var watchedProps,
        EditorControllerMixin;
    
    // this array will hold properties we need to watch
    // to know if the model has been changed (`controller.isDirty`)
    watchedProps = ['scratch', 'titleScratch', 'model.isDirty', 'tags.[]'];
    
    PostModel.eachAttribute(function (name) {
        watchedProps.push('model.' + name);
    });
    
    EditorControllerMixin = Ember.Mixin.create(MarkerManager, {
        needs: ['post-tags-input', 'post-settings-menu'],
    
        init: function () {
            var self = this;
    
            this._super();
    
            window.onbeforeunload = function () {
                return self.get('isDirty') ? self.unloadDirtyMessage() : null;
            };
        },
    
        /**
         * By default, a post will not change its publish state.
         * Only with a user-set value (via setSaveType action)
         * can the post's status change.
         */
        willPublish: boundOneWay('isPublished'),
    
        // Make sure editor starts with markdown shown
        isPreview: false,
    
        // set by the editor route and `isDirty`. useful when checking
        // whether the number of tags has changed for `isDirty`.
        previousTagNames: null,
    
        tagNames: Ember.computed('tags.@each.name', function () {
            return this.get('tags').mapBy('name');
        }),
    
        // compares previousTagNames to tagNames
        tagNamesEqual: function () {
            var tagNames = this.get('tagNames'),
                previousTagNames = this.get('previousTagNames'),
                hashCurrent,
                hashPrevious;
    
            // beware! even if they have the same length,
            // that doesn't mean they're the same.
            if (tagNames.length !== previousTagNames.length) {
                return false;
            }
    
            // instead of comparing with slow, nested for loops,
            // perform join on each array and compare the strings
            hashCurrent = tagNames.join('');
            hashPrevious = previousTagNames.join('');
    
            return hashCurrent === hashPrevious;
        },
    
        // a hook created in editor-base-route's setupController
        modelSaved: function () {
            var model = this.get('model');
    
            // safer to updateTags on save in one place
            // rather than in all other places save is called
            model.updateTags();
    
            // set previousTagNames to current tagNames for isDirty check
            this.set('previousTagNames', this.get('tagNames'));
    
            // `updateTags` triggers `isDirty => true`.
            // for a saved model it would otherwise be false.
    
            // if the two "scratch" properties (title and content) match the model, then
            // it's ok to set isDirty to false
            if (this.get('titleScratch') === model.get('title') &&
                this.get('scratch') === model.get('markdown')) {
                this.set('isDirty', false);
            }
        },
    
        // an ugly hack, but necessary to watch all the model's properties
        // and more, without having to be explicit and do it manually
        isDirty: Ember.computed.apply(Ember, watchedProps.concat(function (key, value) {
            if (arguments.length > 1) {
                return value;
            }
    
            var model = this.get('model'),
                markdown = this.get('markdown'),
                title = this.get('title'),
                titleScratch = this.get('titleScratch'),
                scratch = this.getMarkdown().withoutMarkers,
                changedAttributes;
    
            if (!this.tagNamesEqual()) {
                return true;
            }
    
            if (titleScratch !== title) {
                return true;
            }
    
            // since `scratch` is not model property, we need to check
            // it explicitly against the model's markdown attribute
            if (markdown !== scratch) {
                return true;
            }
    
            // if the Adapter failed to save the model isError will be true
            // and we should consider the model still dirty.
            if (model.get('isError')) {
                return true;
            }
    
            // models created on the client always return `isDirty: true`,
            // so we need to see which properties have actually changed.
            if (model.get('isNew')) {
                changedAttributes = Ember.keys(model.changedAttributes());
    
                if (changedAttributes.length) {
                    return true;
                }
    
                return false;
            }
    
            // even though we use the `scratch` prop to show edits,
            // which does *not* change the model's `isDirty` property,
            // `isDirty` will tell us if the other props have changed,
            // as long as the model is not new (model.isNew === false).
            return model.get('isDirty');
        })),
    
        // used on window.onbeforeunload
        unloadDirtyMessage: function () {
            return '==============================\n\n' +
                'Hey there! It looks like you\'re in the middle of writing' +
                ' something and you haven\'t saved all of your content.' +
                '\n\nSave before you go!\n\n' +
                '==============================';
        },
    
        // TODO: This has to be moved to the I18n localization file.
        // This structure is supposed to be close to the i18n-localization which will be used soon.
        messageMap: {
            errors: {
                post: {
                    published: {
                        published: 'Update failed.',
                        draft: 'Saving failed.'
                    },
                    draft: {
                        published: 'Publish failed.',
                        draft: 'Saving failed.'
                    }
    
                }
            },
    
            success: {
                post: {
                    published: {
                        published: 'Updated.',
                        draft: 'Saved.'
                    },
                    draft: {
                        published: 'Published!',
                        draft: 'Saved.'
                    }
                }
            }
        },
    
        showSaveNotification: function (prevStatus, status, delay) {
            var message = this.messageMap.success.post[prevStatus][status],
                path = this.get('ghostPaths.url').join(this.get('config.blogUrl'), this.get('url'));
    
            if (status === 'published') {
                message += '&nbsp;<a href="' + path + '">View Post</a>';
            }
            this.notifications.showSuccess(message, {delayed: delay});
        },
    
        showErrorNotification: function (prevStatus, status, errors, delay) {
            var message = this.messageMap.errors.post[prevStatus][status],
                error = (errors && errors[0] && errors[0].message) || 'Unknown Error';
    
            message += '<br />' + error;
    
            this.notifications.showError(message, {delayed: delay});
        },
    
        shouldFocusTitle: Ember.computed.alias('model.isNew'),
        shouldFocusEditor: Ember.computed.not('model.isNew'),
    
        actions: {
            save: function (options) {
                var status = this.get('willPublish') ? 'published' : 'draft',
                    prevStatus = this.get('status'),
                    isNew = this.get('isNew'),
                    autoSaveId = this.get('autoSaveId'),
                    timedSaveId = this.get('timedSaveId'),
                    self = this,
                    psmController = this.get('controllers.post-settings-menu'),
                    promise;
    
                options = options || {};
    
                if (autoSaveId) {
                    Ember.run.cancel(autoSaveId);
                    this.set('autoSaveId', null);
                }
    
                if (timedSaveId) {
                    Ember.run.cancel(timedSaveId);
                    this.set('timedSaveId', null);
                }
    
                self.notifications.closePassive();
    
                // ensure an incomplete tag is finalised before save
                this.get('controllers.post-tags-input').send('addNewTag');
    
                // Set the properties that are indirected
                // set markdown equal to what's in the editor, minus the image markers.
                this.set('markdown', this.getMarkdown().withoutMarkers);
                this.set('status', status);
    
                // Set a default title
                if (!this.get('titleScratch').trim()) {
                    this.set('titleScratch', '(Untitled)');
                }
    
                this.set('title', this.get('titleScratch'));
                this.set('meta_title', psmController.get('metaTitleScratch'));
                this.set('meta_description', psmController.get('metaDescriptionScratch'));
    
                if (!this.get('slug')) {
                    // Cancel any pending slug generation that may still be queued in the
                    // run loop because we need to run it before the post is saved.
                    Ember.run.cancel(psmController.get('debounceId'));
    
                    psmController.generateAndSetSlug('slug');
                }
    
                promise = Ember.RSVP.resolve(psmController.get('lastPromise')).then(function () {
                    return self.get('model').save(options).then(function (model) {
                        if (!options.silent) {
                            self.showSaveNotification(prevStatus, model.get('status'), isNew ? true : false);
                        }
    
                        return model;
                    });
                }).catch(function (errors) {
                    if (!options.silent) {
                        self.showErrorNotification(prevStatus, self.get('status'), errors);
                    }
    
                    self.set('status', prevStatus);
    
                    return self.get('model');
                });
    
                psmController.set('lastPromise', promise);
    
                return promise;
            },
    
            setSaveType: function (newType) {
                if (newType === 'publish') {
                    this.set('willPublish', true);
                } else if (newType === 'draft') {
                    this.set('willPublish', false);
                } else {
                    console.warn('Received invalid save type; ignoring.');
                }
            },
    
            // set from a `sendAction` on the codemirror component,
            // so that we get a reference for handling uploads.
            setCodeMirror: function (codemirrorComponent) {
                var codemirror = codemirrorComponent.get('codemirror');
    
                this.set('codemirrorComponent', codemirrorComponent);
                this.set('codemirror', codemirror);
            },
    
            // fired from the gh-markdown component when an image upload starts
            disableCodeMirror: function () {
                this.get('codemirrorComponent').disableCodeMirror();
            },
    
            // fired from the gh-markdown component when an image upload finishes
            enableCodeMirror: function () {
                this.get('codemirrorComponent').enableCodeMirror();
            },
    
            // Match the uploaded file to a line in the editor, and update that line with a path reference
            // ensuring that everything ends up in the correct place and format.
            handleImgUpload: function (e, resultSrc) {
                var editor = this.get('codemirror'),
                    line = this.findLine(Ember.$(e.currentTarget).attr('id')),
                    lineNumber = editor.getLineNumber(line),
                    // jscs:disable
                    match = line.text.match(/\([^\n]*\)?/),
                    // jscs:enable
                    replacement = '(http://)';
    
                if (match) {
                    // simple case, we have the parenthesis
                    editor.setSelection(
                        {line: lineNumber, ch: match.index + 1},
                        {line: lineNumber, ch: match.index + match[0].length - 1}
                    );
                } else {
                    // jscs:disable
                    match = line.text.match(/\]/);
                    // jscs:enable
                    if (match) {
                        editor.replaceRange(
                            replacement,
                            {line: lineNumber, ch: match.index + 1},
                            {line: lineNumber, ch: match.index + 1}
                        );
                        editor.setSelection(
                            {line: lineNumber, ch: match.index + 2},
                            {line: lineNumber, ch: match.index + replacement.length}
                        );
                    }
                }
    
                editor.replaceSelection(resultSrc);
            },
    
            togglePreview: function (preview) {
                this.set('isPreview', preview);
            },
    
            autoSave: function () {
                if (this.get('model.isDraft')) {
                    var autoSaveId,
                        timedSaveId;
    
                    timedSaveId = Ember.run.throttle(this, 'send', 'save', {silent: true, disableNProgress: true}, 60000, false);
                    this.set('timedSaveId', timedSaveId);
    
                    autoSaveId = Ember.run.debounce(this, 'send', 'save', {silent: true, disableNProgress: true}, 3000);
                    this.set('autoSaveId', autoSaveId);
                }
            },
    
            autoSaveNew: function () {
                if (this.get('isNew')) {
                    this.send('save', {silent: true, disableNProgress: true});
                }
            }
        }
    });
    
    __exports__["default"] = EditorControllerMixin;
  });
define("ghost/mixins/editor-base-route", 
  ["ghost/mixins/shortcuts-route","ghost/mixins/style-body","ghost/mixins/loading-indicator","ghost/utils/editor-shortcuts","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var ShortcutsRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    var loadingIndicator = __dependency3__["default"];

    var editorShortcuts = __dependency4__["default"];

    
    var EditorBaseRoute = Ember.Mixin.create(styleBody, ShortcutsRoute, loadingIndicator, {
        classNames: ['editor'],
    
        actions: {
            save: function () {
                this.get('controller').send('save');
            },
    
            publish: function () {
                var controller = this.get('controller');
    
                controller.send('setSaveType', 'publish');
                controller.send('save');
            },
    
            toggleZenMode: function () {
                Ember.$('body').toggleClass('zen');
            },
    
            // The actual functionality is implemented in utils/codemirror-shortcuts
            codeMirrorShortcut: function (options) {
                // Only fire editor shortcuts when the editor has focus.
                if (Ember.$('.CodeMirror.CodeMirror-focused').length > 0) {
                    this.get('controller.codemirror').shortcut(options.type);
                }
            },
    
            willTransition: function (transition) {
                var controller = this.get('controller'),
                    scratch = controller.get('scratch'),
                    controllerIsDirty = controller.get('isDirty'),
                    model = controller.get('model'),
                    state = model.getProperties('isDeleted', 'isSaving', 'isDirty', 'isNew'),
                    fromNewToEdit,
                    deletedWithoutChanges;
    
                fromNewToEdit = this.get('routeName') === 'editor.new' &&
                    transition.targetName === 'editor.edit' &&
                    transition.intent.contexts &&
                    transition.intent.contexts[0] &&
                    transition.intent.contexts[0].id === model.get('id');
    
                deletedWithoutChanges = state.isDeleted &&
                    (state.isSaving || !state.isDirty);
    
                this.send('closeSettingsMenu');
    
                if (!fromNewToEdit && !deletedWithoutChanges && controllerIsDirty) {
                    transition.abort();
                    this.send('openModal', 'leave-editor', [controller, transition]);
                    return;
                }
    
                // The controller may hold model state that will be lost in the transition,
                // so we need to apply it now.
                if (fromNewToEdit && controllerIsDirty) {
                    if (scratch !== model.get('markdown')) {
                        model.set('markdown', scratch);
                    }
                }
    
                if (state.isNew) {
                    model.deleteRecord();
                }
    
                // since the transition is now certain to complete..
                window.onbeforeunload = null;
    
                // remove model-related listeners created in editor-base-route
                this.detachModelHooks(controller, model);
            }
        },
    
        renderTemplate: function (controller, model) {
            this._super(controller, model);
    
            this.render('post-settings-menu', {
                into: 'application',
                outlet: 'settings-menu',
                model: model
            });
        },
    
        shortcuts: editorShortcuts,
    
        attachModelHooks: function (controller, model) {
            // this will allow us to track when the model is saved and update the controller
            // so that we can be sure controller.isDirty is correct, without having to update the
            // controller on each instance of `model.save()`.
            //
            // another reason we can't do this on `model.save().then()` is because the post-settings-menu
            // also saves the model, and passing messages is difficult because we have two
            // types of editor controllers, and the PSM also exists on the posts.post route.
            //
            // The reason we can't just keep this functionality in the editor controller is
            // because we need to remove these handlers on `willTransition` in the editor route.
            model.on('didCreate', controller, controller.get('modelSaved'));
            model.on('didUpdate', controller, controller.get('modelSaved'));
        },
    
        detachModelHooks: function (controller, model) {
            model.off('didCreate', controller, controller.get('modelSaved'));
            model.off('didUpdate', controller, controller.get('modelSaved'));
        },
    
        setupController: function (controller, model) {
            this._super(controller, model);
            var tags = model.get('tags');
    
            controller.set('scratch', model.get('markdown'));
    
            controller.set('titleScratch', model.get('title'));
    
            if (tags) {
                // used to check if anything has changed in the editor
                controller.set('previousTagNames', tags.mapBy('name'));
            } else {
                controller.set('previousTagNames', []);
            }
    
            // attach model-related listeners created in editor-base-route
            this.attachModelHooks(controller, model);
        }
    });
    
    __exports__["default"] = EditorBaseRoute;
  });
define("ghost/mixins/editor-base-view", 
  ["ghost/utils/set-scroll-classname","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var setScrollClassName = __dependency1__["default"];

    
    var EditorViewMixin = Ember.Mixin.create({
        // create a hook for jQuery logic that will run after
        // a view and all child views have been rendered,
        // since didInsertElement runs only when the view's el
        // has rendered, and not necessarily all child views.
        //
        // http://mavilein.github.io/javascript/2013/08/01/Ember-JS-After-Render-Event/
        // http://emberjs.com/api/classes/Ember.run.html#method_next
        scheduleAfterRender: function () {
            Ember.run.scheduleOnce('afterRender', this, this.afterRenderEvent);
        }.on('didInsertElement'),
    
        // all child views will have rendered when this fires
        afterRenderEvent: function () {
            var $previewViewPort = this.$('.js-entry-preview-content');
    
            // cache these elements for use in other methods
            this.set('$previewViewPort', $previewViewPort);
            this.set('$previewContent', this.$('.js-rendered-markdown'));
    
            $previewViewPort.scroll(Ember.run.bind($previewViewPort, setScrollClassName, {
                target: this.$('.js-entry-preview'),
                offset: 10
            }));
        },
    
        removeScrollHandlers: function () {
            this.get('$previewViewPort').off('scroll');
        }.on('willDestroyElement'),
    
        // updated when gh-codemirror component scrolls
        markdownScrollInfo: null,
    
        // percentage of scroll position to set htmlPreview
        scrollPosition: Ember.computed('markdownScrollInfo', function () {
            if (!this.get('markdownScrollInfo')) {
                return 0;
            }
    
            var scrollInfo = this.get('markdownScrollInfo'),
                markdownHeight,
                previewHeight,
                ratio;
    
            markdownHeight = scrollInfo.height - scrollInfo.clientHeight;
            previewHeight = this.get('$previewContent').height() - this.get('$previewViewPort').height();
    
            ratio = previewHeight / markdownHeight;
    
            return scrollInfo.top * ratio;
        })
    });
    
    __exports__["default"] = EditorViewMixin;
  });
define("ghost/mixins/loading-indicator", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // mixin used for routes to display a loading indicator when there is network activity
    var loaderOptions,
        loadingIndicator;
    
    loaderOptions = {
        showSpinner: false
    };
    
    NProgress.configure(loaderOptions);
    
    loadingIndicator = Ember.Mixin.create({
        actions:  {
    
            loading: function () {
                NProgress.start();
                this.router.one('didTransition', function () {
                    NProgress.done();
                });
    
                return true;
            },
    
            error: function () {
                NProgress.done();
    
                return true;
            }
        }
    });
    
    __exports__["default"] = loadingIndicator;
  });
define("ghost/mixins/marker-manager", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var MarkerManager = Ember.Mixin.create({
        // jscs:disable
        imageMarkdownRegex: /^(?:\{<(.*?)>\})?!(?:\[([^\n\]]*)\])(?:\(([^\n\]]*)\))?$/gim,
        markerRegex: /\{<([\w\W]*?)>\}/,
        // jscs:enable
    
        uploadId: 1,
    
        // create an object that will be shared amongst instances.
        // makes it easier to use helper functions in different modules
        markers: {},
    
        // Add markers to the line if it needs one
        initMarkers: function (line) {
            var imageMarkdownRegex = this.get('imageMarkdownRegex'),
                markerRegex = this.get('markerRegex'),
                editor = this.get('codemirror'),
                isImage = line.text.match(imageMarkdownRegex),
                hasMarker = line.text.match(markerRegex);
    
            if (isImage && !hasMarker) {
                this.addMarker(line, editor.getLineNumber(line));
            }
        },
    
        // Get the markdown with all the markers stripped
        getMarkdown: function (value) {
            var marker, id,
                editor = this.get('codemirror'),
                markers = this.get('markers'),
                markerRegexForId = this.get('markerRegexForId'),
                oldValue = value || editor.getValue(),
                newValue = oldValue;
    
            for (id in markers) {
                if (markers.hasOwnProperty(id)) {
                    marker = markers[id];
                    newValue = newValue.replace(markerRegexForId(id), '');
                }
            }
    
            return {
                withMarkers: oldValue,
                withoutMarkers: newValue
            };
        },
    
        // check the given line to see if it has an image, and if it correctly has a marker
        // in the special case of lines which were just pasted in, any markers are removed to prevent duplication
        checkLine: function (ln, mode) {
            var editor = this.get('codemirror'),
                line = editor.getLineHandle(ln),
                imageMarkdownRegex = this.get('imageMarkdownRegex'),
                markerRegex = this.get('markerRegex'),
                isImage = line.text.match(imageMarkdownRegex),
                hasMarker;
    
            // We care if it is an image
            if (isImage) {
                hasMarker = line.text.match(markerRegex);
    
                if (hasMarker && (mode === 'paste' || mode === 'undo')) {
                    // this could be a duplicate, and won't be a real marker
                    this.stripMarkerFromLine(line);
                }
    
                if (!hasMarker) {
                    this.addMarker(line, ln);
                }
            }
            // TODO: hasMarker but no image?
        },
    
        // Add a marker to the given line
        // Params:
        // line - CodeMirror LineHandle
        // ln - line number
        addMarker: function (line, ln) {
            var marker,
                markers = this.get('markers'),
                editor = this.get('codemirror'),
                uploadPrefix = 'image_upload',
                uploadId = this.get('uploadId'),
                magicId = '{<' + uploadId + '>}',
                newText = magicId + line.text;
    
            editor.replaceRange(
                newText,
                {line: ln, ch: 0},
                {line: ln, ch: newText.length}
            );
    
            marker = editor.markText(
                {line: ln, ch: 0},
                {line: ln, ch: (magicId.length)},
                {collapsed: true}
            );
    
            markers[uploadPrefix + '_' + uploadId] = marker;
            this.set('uploadId', uploadId += 1);
        },
    
        // Check each marker to see if it is still present in the editor and if it still corresponds to image markdown
        // If it is no longer a valid image, remove it
        checkMarkers: function () {
            var id, marker, line,
                editor = this.get('codemirror'),
                markers = this.get('markers'),
                imageMarkdownRegex = this.get('imageMarkdownRegex');
    
            for (id in markers) {
                if (markers.hasOwnProperty(id)) {
                    marker = markers[id];
    
                    if (marker.find()) {
                        line = editor.getLineHandle(marker.find().from.line);
                        if (!line.text.match(imageMarkdownRegex)) {
                            this.removeMarker(id, marker, line);
                        }
                    } else {
                        this.removeMarker(id, marker);
                    }
                }
            }
        },
    
        // this is needed for when we transition out of the editor.
        // since the markers object is persistent and shared between classes that
        // mix in this mixin, we need to make sure markers don't carry over between edits.
        clearMarkers: function () {
            var markers = this.get('markers'),
                id,
                marker;
    
            // can't just `this.set('markers', {})`,
            // since it wouldn't apply to this mixin,
            // but only to the class that mixed this mixin in
            for (id in markers) {
                if (markers.hasOwnProperty(id)) {
                    marker = markers[id];
                    delete markers[id];
                    marker.clear();
                }
            }
        },
    
        // Remove a marker
        // Will be passed a LineHandle if we already know which line the marker is on
        removeMarker: function (id, marker, line) {
            var markers = this.get('markers');
    
            delete markers[id];
            marker.clear();
    
            if (line) {
                this.stripMarkerFromLine(line);
            } else {
                this.findAndStripMarker(id);
            }
        },
    
        // Removes the marker on the given line if there is one
        stripMarkerFromLine: function (line) {
            var editor = this.get('codemirror'),
                ln = editor.getLineNumber(line),
    
                // jscs:disable
                markerRegex = /\{<([\w\W]*?)>\}/,
                // jscs:enable
    
                markerText = line.text.match(markerRegex);
    
            if (markerText) {
                editor.replaceRange(
                    '',
                    {line: ln, ch: markerText.index},
                    {line: ln, ch: markerText.index + markerText[0].length}
                );
            }
        },
    
        // the regex
        markerRegexForId: function (id) {
            id = id.replace('image_upload_', '');
            return new RegExp('\\{<' + id + '>\\}', 'gmi');
        },
    
        // Find a marker in the editor by id & remove it
        // Goes line by line to find the marker by it's text if we've lost track of the TextMarker
        findAndStripMarker: function (id) {
            var self = this,
                editor = this.get('codemirror');
    
            editor.eachLine(function (line) {
                var markerText = self.markerRegexForId(id).exec(line.text),
                    ln;
    
                if (markerText) {
                    ln = editor.getLineNumber(line);
                    editor.replaceRange(
                        '',
                        {line: ln, ch: markerText.index},
                        {line: ln, ch: markerText.index + markerText[0].length}
                    );
                }
            });
        },
    
        // Find the line with the marker which matches
        findLine: function (resultId) {
            var editor = this.get('codemirror'),
                markers = this.get('markers');
    
            // try to find the right line to replace
            if (markers.hasOwnProperty(resultId) && markers[resultId].find()) {
                return editor.getLineHandle(markers[resultId].find().from.line);
            }
    
            return false;
        }
    });
    
    __exports__["default"] = MarkerManager;
  });
define("ghost/mixins/nprogress-save", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var NProgressSaveMixin = Ember.Mixin.create({
        save: function (options) {
            if (options && options.disableNProgress) {
                return this._super(options);
            }
    
            NProgress.start();
    
            return this._super(options).then(function (value) {
                NProgress.done();
    
                return value;
            }).catch(function (error) {
                NProgress.done();
    
                return Ember.RSVP.reject(error);
            });
        }
    });
    
    __exports__["default"] = NProgressSaveMixin;
  });
define("ghost/mixins/pagination-controller", 
  ["ghost/utils/ajax","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var getRequestErrorMessage = __dependency1__.getRequestErrorMessage;

    
    var PaginationControllerMixin = Ember.Mixin.create({
        // set from PaginationRouteMixin
        paginationSettings: null,
    
        // holds the next page to load during infinite scroll
        nextPage: null,
    
        // indicates whether we're currently loading the next page
        isLoading: null,
    
        /**
         *
         * @param {object} options: {
         *                      modelType: <String> name of the model that will be paginated
         *                  }
         */
        init: function (options) {
            this._super(options);
    
            var metadata = this.store.metadataFor(options.modelType);
    
            this.set('nextPage', metadata.pagination.next);
        },
    
        /**
         * Takes an ajax response, concatenates any error messages, then generates an error notification.
         * @param {jqXHR} response The jQuery ajax reponse object.
         * @return
         */
        reportLoadError: function (response) {
            var message = 'A problem was encountered while loading more records';
    
            if (response) {
                // Get message from response
                message += ': ' + getRequestErrorMessage(response, true);
            } else {
                message += '.';
            }
    
            this.notifications.showError(message);
        },
    
        actions: {
            /**
             * Loads the next paginated page of posts into the ember-data store. Will cause the posts list UI to update.
             * @return
             */
            loadNextPage: function () {
                var self = this,
                    store = this.get('store'),
                    recordType = this.get('model').get('type'),
                    nextPage = this.get('nextPage'),
                    paginationSettings = this.get('paginationSettings');
    
                if (nextPage) {
                    this.set('isLoading', true);
                    this.set('paginationSettings.page', nextPage);
    
                    store.find(recordType, paginationSettings).then(function () {
                        var metadata = store.metadataFor(recordType);
    
                        self.set('nextPage', metadata.pagination.next);
                        self.set('isLoading', false);
                    }, function (response) {
                        self.reportLoadError(response);
                    });
                }
            }
        }
    });
    
    __exports__["default"] = PaginationControllerMixin;
  });
define("ghost/mixins/pagination-route", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var defaultPaginationSettings,
        PaginationRoute;
    
    defaultPaginationSettings = {
        page: 1,
        limit: 15
    };
    
    PaginationRoute = Ember.Mixin.create({
        /**
         * Sets up pagination details
         * @param {object} settings specifies additional pagination details
         */
        setupPagination: function (settings) {
            settings = settings || {};
            for (var key in defaultPaginationSettings) {
                if (defaultPaginationSettings.hasOwnProperty(key)) {
                    if (!settings.hasOwnProperty(key)) {
                        settings[key] = defaultPaginationSettings[key];
                    }
                }
            }
    
            this.set('paginationSettings', settings);
            this.controller.set('paginationSettings', settings);
        }
    });
    
    __exports__["default"] = PaginationRoute;
  });
define("ghost/mixins/pagination-view-infinite-scroll", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var PaginationViewInfiniteScrollMixin = Ember.Mixin.create({
    
        /**
         * Determines if we are past a scroll point where we need to fetch the next page
         * @param {object} event The scroll event
         */
        checkScroll: function (event) {
            var element = event.target,
                triggerPoint = 100,
                controller = this.get('controller'),
                isLoading = controller.get('isLoading');
    
            // If we haven't passed our threshold or we are already fetching content, exit
            if (isLoading || (element.scrollTop + element.clientHeight + triggerPoint <= element.scrollHeight)) {
                return;
            }
    
            controller.send('loadNextPage');
        },
    
        /**
         * Bind to the scroll event once the element is in the DOM
         */
        attachCheckScroll: function () {
            var el = this.$();
    
            el.on('scroll', Ember.run.bind(this, this.checkScroll));
        }.on('didInsertElement'),
    
        /**
         * Unbind from the scroll event when the element is no longer in the DOM
         */
        detachCheckScroll: function () {
            var el = this.$();
            el.off('scroll');
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = PaginationViewInfiniteScrollMixin;
  });
define("ghost/mixins/selective-save", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // SelectiveSaveMixin adds a saveOnly method to a DS.Model.
    //
    // saveOnly provides a way to save one or more properties of a model while
    // preserving outstanding changes to other properties.
    var SelectiveSaveMixin = Ember.Mixin.create({
        saveOnly: function () {
            if (arguments.length === 0) {
                return Ember.RSVP.resolve();
            }
    
            if (arguments.length === 1 && Ember.isArray(arguments[0])) {
                return this.saveOnly.apply(this, Array.prototype.slice.call(arguments[0]));
            }
    
            var propertiesToSave = Array.prototype.slice.call(arguments),
                changed,
                hasMany = {},
                belongsTo = {},
                self = this;
    
            changed = this.changedAttributes();
    
            // disable observers so we can make changes to the model but not have
            // them reflected by the UI
            this.beginPropertyChanges();
    
            // make a copy of any relations the model may have so they can
            // be reapplied later
            this.eachRelationship(function (name, meta) {
                if (meta.kind === 'hasMany') {
                    hasMany[name] = self.get(name).slice();
                    return;
                }
    
                if (meta.kind === 'belongsTo') {
                    belongsTo[name] = self.get(name);
                    return;
                }
            });
    
            try {
                // roll back all changes to the model and then reapply only those that
                // are part of the saveOnly
    
                self.rollback();
    
                propertiesToSave.forEach(function (name) {
                    if (hasMany.hasOwnProperty(name)) {
                        self.get(name).clear();
    
                        hasMany[name].forEach(function (relatedType) {
                            self.get(name).pushObject(relatedType);
                        });
    
                        return;
                    }
    
                    if (belongsTo.hasOwnProperty(name)) {
                        return self.updateBelongsTo(name, belongsTo[name]);
                    }
    
                    if (changed.hasOwnProperty(name)) {
                        return self.set(name, changed[name][1]);
                    }
                });
            }
            catch (err) {
                // if we were not able to get the model into the correct state
                // put it back the way we found it and return a rejected promise
    
                Ember.keys(changed).forEach(function (name) {
                    self.set(name, changed[name][1]);
                });
    
                Ember.keys(hasMany).forEach(function (name) {
                    self.updateHasMany(name, hasMany[name]);
                });
    
                Ember.keys(belongsTo).forEach(function (name) {
                    self.updateBelongsTo(name, belongsTo[name]);
                });
    
                self.endPropertyChanges();
    
                return Ember.RSVP.reject(new Error(err.message || 'Error during saveOnly. Changes NOT saved.'));
            }
    
            return this.save().finally(function () {
                // reapply any changes that were not part of the save
    
                Ember.keys(changed).forEach(function (name) {
                    if (propertiesToSave.hasOwnProperty(name)) {
                        return;
                    }
    
                    self.set(name, changed[name][1]);
                });
    
                Ember.keys(hasMany).forEach(function (name) {
                    if (propertiesToSave.hasOwnProperty(name)) {
                        return;
                    }
    
                    self.updateHasMany(name, hasMany[name]);
                });
    
                Ember.keys(belongsTo).forEach(function (name) {
                    if (propertiesToSave.hasOwnProperty(name)) {
                        return;
                    }
    
                    self.updateBelongsTo(name, belongsTo[name]);
                });
    
                // signal that we're finished and normal model observation may continue
                self.endPropertyChanges();
            });
        }
    });
    
    __exports__["default"] = SelectiveSaveMixin;
  });
define("ghost/mixins/shortcuts-route", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global key */
    
    // Configure KeyMaster to respond to all shortcuts,
    // even inside of
    // input, textarea, and select.
    key.filter = function () {
        return true;
    };
    
    key.setScope('default');
    /**
     * Only routes can implement shortcuts.
     * If you need to trigger actions on the controller,
     * simply call them with `this.get('controller').send('action')`.
     *
     * To implement shortcuts, add this mixin to your `extend()`,
     * and implement a `shortcuts` hash.
     * In this hash, keys are shortcut combinations and values are route action names.
     *  (see [keymaster docs](https://github.com/madrobby/keymaster/blob/master/README.markdown)),
     *
     * ```javascript
     * shortcuts: {
     *     'ctrl+s, command+s': 'save',
     *     'ctrl+alt+z': 'toggleZenMode'
     * }
     * ```
     * For more complex actions, shortcuts can instead have their value
     * be an object like {action, options}
     * ```javascript
     * shortcuts: {
     *      'ctrl+k': {action: 'markdownShortcut', options: 'createLink'}
     * }
     * ```
     * You can set the scope of your shortcut by passing a scope property.
     * ```javascript
     * shortcuts : {
     *   'enter': {action : 'confirmModal', scope: 'modal'}
     * }
     * ```
     * If you don't specify a scope, we use a default scope called "default".
     * To have all your shortcut work in all scopes, give it the scope "all".
     * Find out more at the keymaster docs
     */
    var ShortcutsRoute = Ember.Mixin.create({
        registerShortcuts: function () {
            var self = this,
                shortcuts = this.get('shortcuts');
    
            Ember.keys(shortcuts).forEach(function (shortcut) {
                var scope = shortcuts[shortcut].scope || 'default',
                    action = shortcuts[shortcut],
                    options;
    
                if (Ember.typeOf(action) !== 'string') {
                    options = action.options;
                    action = action.action;
                }
    
                key(shortcut, scope, function (event) {
                    // stop things like ctrl+s from actually opening a save dialogue
                    event.preventDefault();
                    self.send(action, options);
                });
            });
        },
    
        removeShortcuts: function () {
            var shortcuts = this.get('shortcuts');
    
            Ember.keys(shortcuts).forEach(function (shortcut) {
                key.unbind(shortcut);
            });
        },
    
        activate: function () {
            this._super();
            this.registerShortcuts();
        },
    
        deactivate: function () {
            this._super();
            this.removeShortcuts();
        }
    });
    
    __exports__["default"] = ShortcutsRoute;
  });
define("ghost/mixins/style-body", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // mixin used for routes that need to set a css className on the body tag
    
    var styleBody = Ember.Mixin.create({
        activate: function () {
            this._super();
    
            var cssClasses = this.get('classNames');
    
            if (cssClasses) {
                Ember.run.schedule('afterRender', null, function () {
                    cssClasses.forEach(function (curClass) {
                        Ember.$('body').addClass(curClass);
                    });
                });
            }
        },
    
        deactivate: function () {
            this._super();
    
            var cssClasses = this.get('classNames');
    
            Ember.run.schedule('afterRender', null, function () {
                cssClasses.forEach(function (curClass) {
                    Ember.$('body').removeClass(curClass);
                });
            });
        }
    });
    
    __exports__["default"] = styleBody;
  });
define("ghost/mixins/text-input", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var BlurField = Ember.Mixin.create({
        selectOnClick: false,
        stopEnterKeyDownPropagation: false,
    
        click: function (event) {
            if (this.get('selectOnClick')) {
                event.currentTarget.select();
            }
        },
    
        keyDown: function (event) {
            // stop event propagation when pressing "enter"
            // most useful in the case when undesired (global) keyboard shortcuts are getting triggered while interacting
            // with this particular input element.
            if (this.get('stopEnterKeyDownPropagation') && event.keyCode === 13) {
                event.stopPropagation();
    
                return true;
            }
        }
    });
    
    __exports__["default"] = BlurField;
  });
define("ghost/mixins/validation-engine", 
  ["ghost/utils/ajax","ghost/utils/validator-extensions","ghost/validators/post","ghost/validators/setup","ghost/validators/signup","ghost/validators/signin","ghost/validators/forgotten","ghost/validators/setting","ghost/validators/reset","ghost/validators/user","ghost/validators/tag-settings","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __exports__) {
    "use strict";
    var getRequestErrorMessage = __dependency1__.getRequestErrorMessage;

    
    var ValidatorExtensions = __dependency2__["default"];

    var PostValidator = __dependency3__["default"];

    var SetupValidator = __dependency4__["default"];

    var SignupValidator = __dependency5__["default"];

    var SigninValidator = __dependency6__["default"];

    var ForgotValidator = __dependency7__["default"];

    var SettingValidator = __dependency8__["default"];

    var ResetValidator = __dependency9__["default"];

    var UserValidator = __dependency10__["default"];

    var TagSettingsValidator = __dependency11__["default"];

    
    // our extensions to the validator library
    ValidatorExtensions.init();
    
    // format errors to be used in `notifications.showErrors`.
    // result is [{message: 'concatenated error messages'}]
    function formatErrors(errors, opts) {
        var message = 'There was an error';
    
        opts = opts || {};
    
        if (opts.wasSave && opts.validationType) {
            message += ' saving this ' + opts.validationType;
        }
    
        if (Ember.isArray(errors)) {
            // get the validator's error messages from the array.
            // normalize array members to map to strings.
            message = errors.map(function (error) {
                if (typeof error === 'string') {
                    return error;
                }
    
                return error.message;
            }).join('<br />');
        } else if (errors instanceof Error) {
            message += errors.message || '.';
        } else if (typeof errors === 'object') {
            // Get messages from server response
            message += ': ' + getRequestErrorMessage(errors, true);
        } else if (typeof errors === 'string') {
            message += ': ' + errors;
        } else {
            message += '.';
        }
    
        // set format for notifications.showErrors
        message = [{message: message}];
    
        return message;
    }
    
    /**
    * The class that gets this mixin will receive these properties and functions.
    * It will be able to validate any properties on itself (or the model it passes to validate())
    * with the use of a declared validator.
    */
    var ValidationEngine = Ember.Mixin.create({
        // these validators can be passed a model to validate when the class that
        // mixes in the ValidationEngine declares a validationType equal to a key on this object.
        // the model is either passed in via `this.validate({ model: object })`
        // or by calling `this.validate()` without the model property.
        // in that case the model will be the class that the ValidationEngine
        // was mixed into, i.e. the controller or Ember Data model.
        validators: {
            post: PostValidator,
            setup: SetupValidator,
            signup: SignupValidator,
            signin: SigninValidator,
            forgotten: ForgotValidator,
            setting: SettingValidator,
            reset: ResetValidator,
            user: UserValidator,
            tag: TagSettingsValidator
        },
    
        /**
        * Passses the model to the validator specified by validationType.
        * Returns a promise that will resolve if validation succeeds, and reject if not.
        * Some options can be specified:
        *
        * `format: false` - doesn't use formatErrors to concatenate errors for notifications.showErrors.
        *                   will return whatever the specified validator returns.
        *                   since notifications are a common usecase, `format` is true by default.
        *
        * `model: Object` - you can specify the model to be validated, rather than pass the default value of `this`,
        *                   the class that mixes in this mixin.
        */
        validate: function (opts) {
            var model = opts.model || this,
                type = this.get('validationType'),
                validator = this.get('validators.' + type);
    
            opts = opts || {};
            opts.validationType = type;
    
            return new Ember.RSVP.Promise(function (resolve, reject) {
                var validationErrors;
    
                if (!type || !validator) {
                    validationErrors = ['The validator specified, "' + type + '", did not exist!'];
                } else {
                    validationErrors = validator.check(model);
                }
    
                if (Ember.isEmpty(validationErrors)) {
                    return resolve();
                }
    
                if (opts.format !== false) {
                    validationErrors = formatErrors(validationErrors, opts);
                }
    
                return reject(validationErrors);
            });
        },
    
        /**
        * The primary goal of this method is to override the `save` method on Ember Data models.
        * This allows us to run validation before actually trying to save the model to the server.
        * You can supply options to be passed into the `validate` method, since the ED `save` method takes no options.
        */
        save: function (options) {
            var self = this,
                // this is a hack, but needed for async _super calls.
                // ref: https://github.com/emberjs/ember.js/pull/4301
                _super = this.__nextSuper;
    
            options = options || {};
            options.wasSave = true;
    
            // model.destroyRecord() calls model.save() behind the scenes.
            // in that case, we don't need validation checks or error propagation,
            // because the model itself is being destroyed.
            if (this.get('isDeleted')) {
                return this._super();
            }
    
            // If validation fails, reject with validation errors.
            // If save to the server fails, reject with server response.
            return this.validate(options).then(function () {
                return _super.call(self, options);
            }).catch(function (result) {
                // server save failed - validate() would have given back an array
                if (!Ember.isArray(result)) {
                    if (options.format !== false) {
                        // concatenate all errors into an array with a single object: [{message: 'concatted message'}]
                        result = formatErrors(result, options);
                    } else {
                        // return the array of errors from the server
                        result = getRequestErrorMessage(result);
                    }
                }
    
                return Ember.RSVP.reject(result);
            });
        }
    });
    
    __exports__["default"] = ValidationEngine;
  });
define("ghost/models/notification", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var Notification = DS.Model.extend({
        dismissible: DS.attr('boolean'),
        location: DS.attr('string'),
        status: DS.attr('string'),
        type: DS.attr('string'),
        message: DS.attr('string')
    });
    
    __exports__["default"] = Notification;
  });
define("ghost/models/post", 
  ["ghost/mixins/validation-engine","ghost/mixins/nprogress-save","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ValidationEngine = __dependency1__["default"];

    var NProgressSaveMixin = __dependency2__["default"];

    
    var Post = DS.Model.extend(NProgressSaveMixin, ValidationEngine, {
        validationType: 'post',
    
        uuid: DS.attr('string'),
        title: DS.attr('string', {defaultValue: ''}),
        slug: DS.attr('string'),
        markdown: DS.attr('string', {defaultValue: ''}),
        html: DS.attr('string'),
        image: DS.attr('string'),
        featured: DS.attr('boolean', {defaultValue: false}),
        page: DS.attr('boolean', {defaultValue: false}),
        status: DS.attr('string', {defaultValue: 'draft'}),
        language: DS.attr('string', {defaultValue: 'en_US'}),
        meta_title: DS.attr('string'),
        meta_description: DS.attr('string'),
        author: DS.belongsTo('user',  {async: true}),
        author_id: DS.attr('number'),
        updated_at: DS.attr('moment-date'),
        published_at: DS.attr('moment-date'),
        published_by: DS.belongsTo('user', {async: true}),
        tags: DS.hasMany('tag', {embedded: 'always'}),
        url: DS.attr('string'),
    
        // Computed post properties
    
        isPublished: Ember.computed.equal('status', 'published'),
        isDraft: Ember.computed.equal('status', 'draft'),
    
        // remove client-generated tags, which have `id: null`.
        // Ember Data won't recognize/update them automatically
        // when returned from the server with ids.
        updateTags: function () {
            var tags = this.get('tags'),
                oldTags = tags.filterBy('id', null);
    
            tags.removeObjects(oldTags);
            oldTags.invoke('deleteRecord');
        },
    
        isAuthoredByUser: function (user) {
            return parseInt(user.get('id'), 10) === parseInt(this.get('author_id'), 10);
        }
    
    });
    
    __exports__["default"] = Post;
  });
define("ghost/models/role", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var Role = DS.Model.extend({
        uuid: DS.attr('string'),
        name: DS.attr('string'),
        description: DS.attr('string'),
        created_at: DS.attr('moment-date'),
        updated_at: DS.attr('moment-date'),
    
        lowerCaseName: Ember.computed('name', function () {
            return this.get('name').toLocaleLowerCase();
        })
    });
    
    __exports__["default"] = Role;
  });
define("ghost/models/setting", 
  ["ghost/mixins/validation-engine","ghost/mixins/nprogress-save","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ValidationEngine = __dependency1__["default"];

    var NProgressSaveMixin = __dependency2__["default"];

    
    var Setting = DS.Model.extend(NProgressSaveMixin, ValidationEngine, {
        validationType: 'setting',
    
        title: DS.attr('string'),
        description: DS.attr('string'),
        email: DS.attr('string'),
        logo: DS.attr('string'),
        cover: DS.attr('string'),
        defaultLang: DS.attr('string'),
        postsPerPage: DS.attr('number'),
        forceI18n: DS.attr('boolean'),
        permalinks: DS.attr('string'),
        activeTheme: DS.attr('string'),
        availableThemes: DS.attr(),
        ghost_head: DS.attr('string'),
        ghost_foot: DS.attr('string')
    });
    
    __exports__["default"] = Setting;
  });
define("ghost/models/slug-generator", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SlugGenerator = Ember.Object.extend({
        ghostPaths: null,
        slugType: null,
        value: null,
        toString: function () {
            return this.get('value');
        },
        generateSlug: function (textToSlugify) {
            var self = this,
                url;
    
            if (!textToSlugify) {
                return Ember.RSVP.resolve('');
            }
    
            url = this.get('ghostPaths.url').api('slugs', this.get('slugType'), encodeURIComponent(textToSlugify));
    
            return ic.ajax.request(url, {
                type: 'GET'
            }).then(function (response) {
                var slug = response.slugs[0].slug;
                self.set('value', slug);
                return slug;
            });
        }
    });
    
    __exports__["default"] = SlugGenerator;
  });
define("ghost/models/tag", 
  ["ghost/mixins/validation-engine","ghost/mixins/nprogress-save","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ValidationEngine = __dependency1__["default"];

    var NProgressSaveMixin = __dependency2__["default"];

    
    var Tag = DS.Model.extend(NProgressSaveMixin, ValidationEngine, {
        validationType: 'tag',
    
        uuid: DS.attr('string'),
        name: DS.attr('string'),
        slug: DS.attr('string'),
        description: DS.attr('string'),
        parent_id: DS.attr('number'),
        meta_title: DS.attr('string'),
        meta_description: DS.attr('string'),
        image: DS.attr('string')
    });
    
    __exports__["default"] = Tag;
  });
define("ghost/models/user", 
  ["ghost/mixins/validation-engine","ghost/mixins/nprogress-save","ghost/mixins/selective-save","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var ValidationEngine = __dependency1__["default"];

    var NProgressSaveMixin = __dependency2__["default"];

    var SelectiveSaveMixin = __dependency3__["default"];

    
    var User = DS.Model.extend(NProgressSaveMixin, SelectiveSaveMixin, ValidationEngine, {
        validationType: 'user',
    
        uuid: DS.attr('string'),
        name: DS.attr('string'),
        slug: DS.attr('string'),
        email: DS.attr('string'),
        image: DS.attr('string'),
        cover: DS.attr('string'),
        bio: DS.attr('string'),
        website: DS.attr('string'),
        location: DS.attr('string'),
        accessibility: DS.attr('string'),
        status: DS.attr('string'),
        language: DS.attr('string', {defaultValue: 'en_US'}),
        meta_title: DS.attr('string'),
        meta_description: DS.attr('string'),
        last_login: DS.attr('moment-date'),
        created_at: DS.attr('moment-date'),
        created_by: DS.attr('number'),
        updated_at: DS.attr('moment-date'),
        updated_by: DS.attr('number'),
        roles: DS.hasMany('role', {embedded: 'always'}),
    
        role: Ember.computed('roles', function (name, value) {
            if (arguments.length > 1) {
                // Only one role per user, so remove any old data.
                this.get('roles').clear();
                this.get('roles').pushObject(value);
    
                return value;
            }
    
            return this.get('roles.firstObject');
        }),
    
        // TODO: Once client-side permissions are in place,
        // remove the hard role check.
        isAuthor: Ember.computed.equal('role.name', 'Author'),
        isEditor: Ember.computed.equal('role.name', 'Editor'),
        isAdmin: Ember.computed.equal('role.name', 'Administrator'),
        isOwner: Ember.computed.equal('role.name', 'Owner'),
    
        saveNewPassword: function () {
            var url = this.get('ghostPaths.url').api('users', 'password');
    
            return ic.ajax.request(url, {
                type: 'PUT',
                data: {
                    password: [{
                        user_id: this.get('id'),
                        oldPassword: this.get('password'),
                        newPassword: this.get('newPassword'),
                        ne2Password: this.get('ne2Password')
                    }]
                }
            });
        },
    
        resendInvite: function () {
            var fullUserData = this.toJSON(),
                userData = {
                    email: fullUserData.email,
                    roles: fullUserData.roles
                };
    
            return ic.ajax.request(this.get('ghostPaths.url').api('users'), {
                type: 'POST',
                data: JSON.stringify({users: [userData]}),
                contentType: 'application/json'
            });
        },
    
        passwordValidationErrors: Ember.computed('password', 'newPassword', 'ne2Password', function () {
            var validationErrors = [];
    
            if (!validator.equals(this.get('newPassword'), this.get('ne2Password'))) {
                validationErrors.push({message: 'Your new passwords do not match'});
            }
    
            if (!validator.isLength(this.get('newPassword'), 8)) {
                validationErrors.push({message: 'Your password is not long enough. It must be at least 8 characters long.'});
            }
    
            return validationErrors;
        }),
    
        isPasswordValid: Ember.computed.empty('passwordValidationErrors.[]'),
    
        active: function () {
            return ['active', 'warn-1', 'warn-2', 'warn-3', 'warn-4', 'locked'].indexOf(this.get('status')) > -1;
        }.property('status'),
    
        invited: function () {
            return ['invited', 'invited-pending'].indexOf(this.get('status')) > -1;
        }.property('status'),
    
        pending: Ember.computed.equal('status', 'invited-pending').property('status')
    });
    
    __exports__["default"] = User;
  });
define("ghost/router", 
  ["ghost/utils/ghost-paths","ghost/utils/document-title","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ghostPaths = __dependency1__["default"];

    var documentTitle = __dependency2__["default"];

    
    var Router = Ember.Router.extend({
        location: 'trailing-history', // use HTML5 History API instead of hash-tag based URLs
        rootURL: ghostPaths().adminRoot, // admin interface lives under sub-directory /ghost
    
        clearNotifications: Ember.on('didTransition', function () {
            this.notifications.closePassive();
            this.notifications.displayDelayed();
        })
    });
    
    documentTitle();
    
    Router.map(function () {
        this.route('setup');
        this.route('signin');
        this.route('signout');
        this.route('signup', {path: '/signup/:token'});
        this.route('forgotten');
        this.route('reset', {path: '/reset/:token'});
    
        this.resource('posts', {path: '/'}, function () {
            this.route('post', {path: ':post_id'});
        });
    
        this.resource('editor', function () {
            this.route('new', {path: ''});
            this.route('edit', {path: ':post_id'});
        });
    
        this.resource('settings', function () {
            this.route('general');
    
            this.resource('settings.users', {path: '/users'}, function () {
                this.route('user', {path: '/:slug'});
            });
    
            this.route('about');
            this.route('tags');
            this.route('labs');
            this.route('code-injection');
        });
    
        // Redirect debug to settings labs
        this.route('debug');
    
        // Redirect legacy content to posts
        this.route('content');
    
        this.route('error404', {path: '/*path'});
    });
    
    __exports__["default"] = Router;
  });
define("ghost/routes/application", 
  ["ghost/mixins/shortcuts-route","ghost/utils/ctrl-or-cmd","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    /* global key */
    var ShortcutsRoute = __dependency1__["default"];

    var ctrlOrCmd = __dependency2__["default"];

    
    var ApplicationRoute,
        shortcuts = {};
    
    shortcuts.esc = {action: 'closePopups', scope: 'all'};
    shortcuts.enter = {action: 'confirmModal', scope: 'modal'};
    shortcuts[ctrlOrCmd + '+s'] = {action: 'save', scope: 'all'};
    
    ApplicationRoute = Ember.Route.extend(SimpleAuth.ApplicationRouteMixin, ShortcutsRoute, {
        shortcuts: shortcuts,
    
        afterModel: function (model, transition) {
            if (this.get('session').isAuthenticated) {
                transition.send('loadServerNotifications');
            }
        },
    
        title: function (tokens) {
            return tokens.join(' - ') + ' - ' + this.get('config.blogTitle');
        },
    
        actions: {
            toggleGlobalMobileNav: function () {
                this.toggleProperty('controller.showGlobalMobileNav');
            },
    
            openSettingsMenu: function () {
                this.set('controller.showSettingsMenu', true);
            },
    
            closeSettingsMenu: function () {
                this.set('controller.showSettingsMenu', false);
            },
    
            toggleSettingsMenu: function () {
                this.toggleProperty('controller.showSettingsMenu');
            },
    
            closePopups: function () {
                this.get('dropdown').closeDropdowns();
                this.get('notifications').closeAll();
    
                // Close right outlet if open
                this.send('closeSettingsMenu');
    
                this.send('closeModal');
            },
    
            signedIn: function () {
                this.send('loadServerNotifications', true);
            },
    
            sessionAuthenticationFailed: function (error) {
                if (error.errors) {
                    this.notifications.showErrors(error.errors);
                } else {
                    // connection errors don't return proper status message, only req.body
                    this.notifications.showError('There was a problem on the server.');
                }
            },
    
            sessionAuthenticationSucceeded: function () {
                var appController = this.controllerFor('application'),
                    self = this;
    
                if (appController && appController.get('skipAuthSuccessHandler')) {
                    return;
                }
    
                this.store.find('user', 'me').then(function (user) {
                    self.send('signedIn', user);
                    var attemptedTransition = self.get('session').get('attemptedTransition');
                    if (attemptedTransition) {
                        attemptedTransition.retry();
                        self.get('session').set('attemptedTransition', null);
                    } else {
                        self.transitionTo(SimpleAuth.Configuration.routeAfterAuthentication);
                    }
                });
            },
    
            sessionInvalidationFailed: function (error) {
                this.notifications.showError(error.message);
            },
    
            openModal: function (modalName, model, type) {
                this.get('dropdown').closeDropdowns();
                key.setScope('modal');
                modalName = 'modals/' + modalName;
                this.set('modalName', modalName);
    
                // We don't always require a modal to have a controller
                // so we're skipping asserting if one exists
                if (this.controllerFor(modalName, true)) {
                    this.controllerFor(modalName).set('model', model);
    
                    if (type) {
                        this.controllerFor(modalName).set('imageType', type);
                        this.controllerFor(modalName).set('src', model.get(type));
                    }
                }
    
                return this.render(modalName, {
                    into: 'application',
                    outlet: 'modal'
                });
            },
    
            confirmModal: function () {
                var modalName = this.get('modalName');
    
                this.send('closeModal');
    
                if (this.controllerFor(modalName, true)) {
                    this.controllerFor(modalName).send('confirmAccept');
                }
            },
    
            closeModal: function () {
                this.disconnectOutlet({
                    outlet: 'modal',
                    parentView: 'application'
                });
    
                key.setScope('default');
            },
    
            loadServerNotifications: function (isDelayed) {
                var self = this;
    
                if (this.session.isAuthenticated) {
                    this.store.findAll('notification').then(function (serverNotifications) {
                        serverNotifications.forEach(function (notification) {
                            self.notifications.handleNotification(notification, isDelayed);
                        });
                    });
                }
            },
    
            handleErrors: function (errors) {
                var self = this;
    
                this.notifications.clear();
                errors.forEach(function (errorObj) {
                    self.notifications.showError(errorObj.message || errorObj);
    
                    if (errorObj.hasOwnProperty('el')) {
                        errorObj.el.addClass('input-error');
                    }
                });
            },
    
            // noop default for unhandled save (used from shortcuts)
            save: Ember.K
        }
    });
    
    __exports__["default"] = ApplicationRoute;
  });
define("ghost/routes/authenticated", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var AuthenticatedRoute = Ember.Route.extend(SimpleAuth.AuthenticatedRouteMixin);
    
    __exports__["default"] = AuthenticatedRoute;
  });
define("ghost/routes/content", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ContentRoute = Ember.Route.extend({
        beforeModel: function () {
            this.transitionTo('posts');
        }
    });
    
    __exports__["default"] = ContentRoute;
  });
define("ghost/routes/debug", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var DebugRoute = Ember.Route.extend({
        beforeModel: function () {
            this.transitionTo('settings.labs');
        }
    });
    
    __exports__["default"] = DebugRoute;
  });
define("ghost/routes/editor/edit", 
  ["ghost/routes/authenticated","ghost/mixins/editor-base-route","ghost/utils/isNumber","ghost/utils/isFinite","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var base = __dependency2__["default"];

    var isNumber = __dependency3__["default"];

    var isFinite = __dependency4__["default"];

    
    var EditorEditRoute = AuthenticatedRoute.extend(base, {
        titleToken: 'Editor',
    
        model: function (params) {
            var self = this,
                post,
                postId,
                query;
    
            postId = Number(params.post_id);
    
            if (!isNumber(postId) || !isFinite(postId) || postId % 1 !== 0 || postId <= 0) {
                return this.transitionTo('error404', 'editor/' + params.post_id);
            }
    
            post = this.store.getById('post', postId);
            if (post) {
                return post;
            }
    
            query = {
                id: postId,
                status: 'all',
                staticPages: 'all'
            };
    
            return self.store.find('post', query).then(function (records) {
                var post = records.get('firstObject');
    
                if (post) {
                    return post;
                }
    
                return self.replaceWith('posts.index');
            });
        },
    
        afterModel: function (post) {
            var self = this;
    
            return self.store.find('user', 'me').then(function (user) {
                if (user.get('isAuthor') && !post.isAuthoredByUser(user)) {
                    return self.replaceWith('posts.index');
                }
            });
        },
    
        actions: {
             authorizationFailed: function () {
                this.send('openModal', 'signin');
            }
        }
    });
    
    __exports__["default"] = EditorEditRoute;
  });
define("ghost/routes/editor/index", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var EditorRoute = Ember.Route.extend({
        beforeModel: function () {
            this.transitionTo('editor.new');
        }
    });
    
    __exports__["default"] = EditorRoute;
  });
define("ghost/routes/editor/new", 
  ["ghost/routes/authenticated","ghost/mixins/editor-base-route","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var base = __dependency2__["default"];

    
    var EditorNewRoute = AuthenticatedRoute.extend(base, {
        titleToken: 'Editor',
    
        model: function () {
            var self = this;
            return this.get('session.user').then(function (user) {
                return self.store.createRecord('post', {
                    author: user
                });
            });
        },
    
        setupController: function (controller, model) {
            var psm = this.controllerFor('post-settings-menu');
    
            // make sure there are no titleObserver functions hanging around
            // from previous posts
            psm.removeObserver('titleScratch', psm, 'titleObserver');
    
            // Ensure that the PSM Image Uploader resets
            psm.send('resetUploader');
    
            this._super(controller, model);
        }
    });
    
    __exports__["default"] = EditorNewRoute;
  });
define("ghost/routes/error404", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var Error404Route = Ember.Route.extend({
        controllerName: 'error',
        templateName: 'error',
        titleToken: 'Error',
    
        model: function () {
            return {
                status: 404
            };
        }
    });
    
    __exports__["default"] = Error404Route;
  });
define("ghost/routes/forgotten", 
  ["ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var styleBody = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    
    var ForgottenRoute = Ember.Route.extend(styleBody, loadingIndicator, {
        titleToken: 'Forgotten Password',
    
        classNames: ['ghost-forgotten']
    });
    
    __exports__["default"] = ForgottenRoute;
  });
define("ghost/routes/mobile-index-route", 
  ["ghost/utils/mobile","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var mobileQuery = __dependency1__["default"];

    
    // Routes that extend MobileIndexRoute need to implement
    // desktopTransition, a function which is called when
    // the user resizes to desktop levels.
    var MobileIndexRoute = Ember.Route.extend({
        desktopTransition: Ember.K,
    
        activate: function attachDesktopTransition() {
            this._super();
            mobileQuery.addListener(this.desktopTransitionMQ);
        },
    
        deactivate: function removeDesktopTransition() {
            this._super();
            mobileQuery.removeListener(this.desktopTransitionMQ);
        },
    
        setDesktopTransitionMQ: function () {
            var self = this;
            this.set('desktopTransitionMQ', function desktopTransitionMQ() {
                if (!mobileQuery.matches) {
                    self.desktopTransition();
                }
            });
        }.on('init')
    });
    
    __exports__["default"] = MobileIndexRoute;
  });
define("ghost/routes/posts", 
  ["ghost/routes/authenticated","ghost/mixins/style-body","ghost/mixins/shortcuts-route","ghost/mixins/loading-indicator","ghost/mixins/pagination-route","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    var ShortcutsRoute = __dependency3__["default"];

    var loadingIndicator = __dependency4__["default"];

    var PaginationRouteMixin = __dependency5__["default"];

    
    var paginationSettings,
        PostsRoute;
    
    paginationSettings = {
        status: 'all',
        staticPages: 'all',
        page: 1
    };
    
    PostsRoute = AuthenticatedRoute.extend(ShortcutsRoute, styleBody, loadingIndicator, PaginationRouteMixin, {
        titleToken: 'Content',
    
        classNames: ['manage'],
    
        model: function () {
            var self = this;
    
            return this.store.find('user', 'me').then(function (user) {
                if (user.get('isAuthor')) {
                    paginationSettings.author = user.get('slug');
                }
    
                // using `.filter` allows the template to auto-update when new models are pulled in from the server.
                // we just need to 'return true' to allow all models by default.
                return self.store.filter('post', paginationSettings, function (post) {
                    if (user.get('isAuthor')) {
                        return post.isAuthoredByUser(user);
                    }
    
                    return true;
                });
            });
        },
    
        setupController: function (controller, model) {
            this._super(controller, model);
            this.setupPagination(paginationSettings);
        },
    
        stepThroughPosts: function (step) {
            var currentPost = this.get('controller.currentPost'),
                posts = this.get('controller.arrangedContent'),
                length = posts.get('length'),
                newPosition;
    
            newPosition = posts.indexOf(currentPost) + step;
    
            // if we are on the first or last item
            // just do nothing (desired behavior is to not
            // loop around)
            if (newPosition >= length) {
                return;
            } else if (newPosition < 0) {
                return;
            }
    
            this.transitionTo('posts.post', posts.objectAt(newPosition));
        },
    
        scrollContent: function (amount) {
            var content = Ember.$('.js-content-preview'),
                scrolled = content.scrollTop();
    
            content.scrollTop(scrolled + 50 * amount);
        },
    
        shortcuts: {
            'up, k': 'moveUp',
            'down, j': 'moveDown',
            left: 'focusList',
            right: 'focusContent',
            c: 'newPost'
        },
    
        actions: {
            focusList: function () {
                this.controller.set('keyboardFocus', 'postList');
            },
            focusContent: function () {
                this.controller.set('keyboardFocus', 'postContent');
            },
            newPost: function () {
                this.transitionTo('editor.new');
            },
    
            moveUp: function () {
                if (this.controller.get('postContentFocused')) {
                    this.scrollContent(-1);
                } else {
                    this.stepThroughPosts(-1);
                }
            },
    
            moveDown: function () {
                if (this.controller.get('postContentFocused')) {
                    this.scrollContent(1);
                } else {
                    this.stepThroughPosts(1);
                }
            }
        }
    });
    
    __exports__["default"] = PostsRoute;
  });
define("ghost/routes/posts/index", 
  ["ghost/routes/mobile-index-route","ghost/mixins/loading-indicator","ghost/utils/mobile","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var MobileIndexRoute = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    var mobileQuery = __dependency3__["default"];

    
    var PostsIndexRoute = MobileIndexRoute.extend(SimpleAuth.AuthenticatedRouteMixin, loadingIndicator, {
        noPosts: false,
    
        // Transition to a specific post if we're not on mobile
        beforeModel: function () {
            if (!mobileQuery.matches) {
                return this.goToPost();
            }
        },
    
        setupController: function (controller, model) {
            /*jshint unused:false*/
            controller.set('noPosts', this.get('noPosts'));
        },
    
        goToPost: function () {
            var self = this,
                // the store has been populated by PostsRoute
                posts = this.store.all('post'),
                post;
    
            return this.store.find('user', 'me').then(function (user) {
                post = posts.find(function (post) {
                    // Authors can only see posts they've written
                    if (user.get('isAuthor')) {
                        return post.isAuthoredByUser(user);
                    }
    
                    return true;
                });
    
                if (post) {
                    return self.transitionTo('posts.post', post);
                }
    
                self.set('noPosts', true);
            });
        },
    
        // Mobile posts route callback
        desktopTransition: function () {
            this.goToPost();
        }
    });
    
    __exports__["default"] = PostsIndexRoute;
  });
define("ghost/routes/posts/post", 
  ["ghost/routes/authenticated","ghost/mixins/loading-indicator","ghost/mixins/shortcuts-route","ghost/utils/isNumber","ghost/utils/isFinite","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    var ShortcutsRoute = __dependency3__["default"];

    var isNumber = __dependency4__["default"];

    var isFinite = __dependency5__["default"];

    
    var PostsPostRoute = AuthenticatedRoute.extend(loadingIndicator, ShortcutsRoute, {
        model: function (params) {
            var self = this,
                post,
                postId,
                query;
    
            postId = Number(params.post_id);
    
            if (!isNumber(postId) || !isFinite(postId) || postId % 1 !== 0 || postId <= 0) {
                return this.transitionTo('error404', params.post_id);
            }
    
            post = this.store.getById('post', postId);
            if (post) {
                return post;
            }
    
            query = {
                id: postId,
                status: 'all',
                staticPages: 'all'
            };
    
            return self.store.find('post', query).then(function (records) {
                var post = records.get('firstObject');
    
                if (post) {
                    return post;
                }
    
                return self.replaceWith('posts.index');
            });
        },
    
        afterModel: function (post) {
            var self = this;
    
            return self.store.find('user', 'me').then(function (user) {
                if (user.get('isAuthor') && !post.isAuthoredByUser(user)) {
                    return self.replaceWith('posts.index');
                }
            });
        },
    
        setupController: function (controller, model) {
            this._super(controller, model);
    
            this.controllerFor('posts').set('currentPost', model);
        },
    
        shortcuts: {
            'enter, o': 'openEditor',
            'command+backspace, ctrl+backspace': 'deletePost'
        },
    
        actions: {
            openEditor: function () {
                this.transitionTo('editor.edit', this.get('controller.model'));
            },
    
            deletePost: function () {
                this.send('openModal', 'delete-post', this.get('controller.model'));
            }
        }
    });
    
    __exports__["default"] = PostsPostRoute;
  });
define("ghost/routes/reset", 
  ["ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var styleBody = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    
    var ResetRoute = Ember.Route.extend(styleBody, loadingIndicator, {
        classNames: ['ghost-reset'],
    
        beforeModel: function () {
            if (this.get('session').isAuthenticated) {
                this.notifications.showWarn('You can\'t reset your password while you\'re signed in.', {delayed: true});
                this.transitionTo(SimpleAuth.Configuration.routeAfterAuthentication);
            }
        },
    
        setupController: function (controller, params) {
            controller.token = params.token;
        },
    
        // Clear out any sensitive information
        deactivate: function () {
            this._super();
            this.controller.clearData();
        }
    });
    
    __exports__["default"] = ResetRoute;
  });
define("ghost/routes/settings", 
  ["ghost/routes/authenticated","ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    var loadingIndicator = __dependency3__["default"];

    
    var SettingsRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, {
        titleToken: 'Settings',
    
        classNames: ['settings']
    });
    
    __exports__["default"] = SettingsRoute;
  });
define("ghost/routes/settings/about", 
  ["ghost/routes/authenticated","ghost/mixins/loading-indicator","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    var styleBody = __dependency3__["default"];

    
    var SettingsAboutRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, {
        titleToken: 'About',
    
        classNames: ['settings-view-about'],
    
        cachedConfig: false,
        model: function () {
            var cachedConfig = this.get('cachedConfig'),
                self = this;
            if (cachedConfig) {
                return cachedConfig;
            }
    
            return ic.ajax.request(this.get('ghostPaths.url').api('configuration'))
                .then(function (configurationResponse) {
                    var configKeyValues = configurationResponse.configuration;
                    cachedConfig = {};
                    configKeyValues.forEach(function (configKeyValue) {
                        cachedConfig[configKeyValue.key] = configKeyValue.value;
                    });
                    self.set('cachedConfig', cachedConfig);
                    return cachedConfig;
                });
        }
    });
    
    __exports__["default"] = SettingsAboutRoute;
  });
define("ghost/routes/settings/apps", 
  ["ghost/routes/authenticated","ghost/mixins/current-user-settings","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var CurrentUserSettings = __dependency2__["default"];

    var styleBody = __dependency3__["default"];

    
    var AppsRoute = AuthenticatedRoute.extend(styleBody, CurrentUserSettings, {
        titleToken: 'Apps',
    
        classNames: ['settings-view-apps'],
    
        beforeModel: function () {
            if (!this.get('config.apps')) {
                return this.transitionTo('settings.general');
            }
    
            return this.currentUser()
                .then(this.transitionAuthor())
                .then(this.transitionEditor());
        },
    
        model: function () {
            return this.store.find('app');
        }
    });
    
    __exports__["default"] = AppsRoute;
  });
define("ghost/routes/settings/code-injection", 
  ["ghost/routes/authenticated","ghost/mixins/loading-indicator","ghost/mixins/current-user-settings","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    var CurrentUserSettings = __dependency3__["default"];

    var styleBody = __dependency4__["default"];

    
    var SettingsCodeInjectionRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, CurrentUserSettings, {
        classNames: ['settings-view-code'],
    
        beforeModel: function () {
            return this.currentUser()
                .then(this.transitionAuthor())
                .then(this.transitionEditor());
        },
    
        model: function () {
            return this.store.find('setting', {type: 'blog,theme'}).then(function (records) {
                return records.get('firstObject');
            });
        },
    
        actions: {
            save: function () {
                this.get('controller').send('save');
            }
        }
    });
    
    __exports__["default"] = SettingsCodeInjectionRoute;
  });
define("ghost/routes/settings/general", 
  ["ghost/routes/authenticated","ghost/mixins/loading-indicator","ghost/mixins/current-user-settings","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    var CurrentUserSettings = __dependency3__["default"];

    var styleBody = __dependency4__["default"];

    
    var SettingsGeneralRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, CurrentUserSettings, {
        titleToken: 'General',
    
        classNames: ['settings-view-general'],
    
        beforeModel: function () {
            return this.currentUser()
                .then(this.transitionAuthor())
                .then(this.transitionEditor());
        },
    
        model: function () {
            return this.store.find('setting', {type: 'blog,theme'}).then(function (records) {
                return records.get('firstObject');
            });
        },
    
        actions: {
            save: function () {
                this.get('controller').send('save');
            }
        }
    });
    
    __exports__["default"] = SettingsGeneralRoute;
  });
define("ghost/routes/settings/index", 
  ["ghost/routes/mobile-index-route","ghost/mixins/current-user-settings","ghost/utils/mobile","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var MobileIndexRoute = __dependency1__["default"];

    var CurrentUserSettings = __dependency2__["default"];

    var mobileQuery = __dependency3__["default"];

    
    var SettingsIndexRoute = MobileIndexRoute.extend(SimpleAuth.AuthenticatedRouteMixin, CurrentUserSettings, {
        titleToken: 'Settings',
    
        // Redirect users without permission to view settings,
        // and show the settings.general route unless the user
        // is mobile
        beforeModel: function () {
            var self = this;
            return this.currentUser()
                .then(this.transitionAuthor())
                .then(this.transitionEditor())
                .then(function () {
                    if (!mobileQuery.matches) {
                        self.transitionTo('settings.general');
                    }
                });
        },
    
        desktopTransition: function () {
            this.transitionTo('settings.general');
        }
    });
    
    __exports__["default"] = SettingsIndexRoute;
  });
define("ghost/routes/settings/labs", 
  ["ghost/routes/authenticated","ghost/mixins/style-body","ghost/mixins/current-user-settings","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    var CurrentUserSettings = __dependency3__["default"];

    var loadingIndicator = __dependency4__["default"];

    
    var LabsRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, CurrentUserSettings, {
        titleToken: 'Labs',
    
        classNames: ['settings'],
        beforeModel: function () {
            return this.currentUser()
                .then(this.transitionAuthor())
                .then(this.transitionEditor());
        },
    
        model: function () {
            return this.store.find('setting', {type: 'blog,theme'}).then(function (records) {
                return records.get('firstObject');
            });
        }
    });
    
    __exports__["default"] = LabsRoute;
  });
define("ghost/routes/settings/tags", 
  ["ghost/routes/authenticated","ghost/mixins/current-user-settings","ghost/mixins/pagination-route","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var CurrentUserSettings = __dependency2__["default"];

    var PaginationRouteMixin = __dependency3__["default"];

    
    var TagsRoute = AuthenticatedRoute.extend(CurrentUserSettings, PaginationRouteMixin, {
    
        actions: {
            willTransition: function () {
                this.send('closeSettingsMenu');
            }
        },
    
        titleToken: 'Tags',
    
        beforeModel: function () {
            if (!this.get('config.tagsUI')) {
                return this.transitionTo('settings.general');
            }
    
            return this.currentUser()
                .then(this.transitionAuthor());
        },
    
        model: function () {
            return this.store.find('tag');
        },
    
        setupController: function (controller, model) {
            this._super(controller, model);
            this.setupPagination();
        },
    
        renderTemplate: function (controller, model) {
            this._super(controller, model);
            this.render('settings/tags/settings-menu', {
                into: 'application',
                outlet: 'settings-menu',
                view: 'settings/tags/settings-menu'
            });
        }
    });
    
    __exports__["default"] = TagsRoute;
  });
define("ghost/routes/settings/users", 
  ["ghost/routes/authenticated","ghost/mixins/current-user-settings","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var CurrentUserSettings = __dependency2__["default"];

    
    var UsersRoute = AuthenticatedRoute.extend(CurrentUserSettings, {
        beforeModel: function () {
            return this.currentUser()
                .then(this.transitionAuthor());
        }
    });
    
    __exports__["default"] = UsersRoute;
  });
define("ghost/routes/settings/users/index", 
  ["ghost/routes/authenticated","ghost/mixins/pagination-route","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var PaginationRouteMixin = __dependency2__["default"];

    var styleBody = __dependency3__["default"];

    
    var paginationSettings,
        UsersIndexRoute;
    
    paginationSettings = {
        page: 1,
        limit: 20,
        status: 'active'
    };
    
    UsersIndexRoute = AuthenticatedRoute.extend(styleBody, PaginationRouteMixin, {
        titleToken: 'Users',
    
        classNames: ['settings-view-users'],
    
        setupController: function (controller, model) {
            this._super(controller, model);
            this.setupPagination(paginationSettings);
        },
    
        model: function () {
            var self = this;
    
            return self.store.find('user', {limit: 'all', status: 'invited'}).then(function () {
                return self.store.find('user', 'me').then(function (currentUser) {
                    if (currentUser.get('isEditor')) {
                        // Editors only see authors in the list
                        paginationSettings.role = 'Author';
                    }
    
                    return self.store.filter('user', paginationSettings, function (user) {
                        if (currentUser.get('isEditor')) {
                            return user.get('isAuthor') || user === currentUser;
                        }
                        return true;
                    });
                });
            });
        },
    
        actions: {
            reload: function () {
                this.refresh();
            }
        }
    });
    
    __exports__["default"] = UsersIndexRoute;
  });
define("ghost/routes/settings/users/user", 
  ["ghost/routes/authenticated","ghost/mixins/style-body","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    
    var SettingsUserRoute = AuthenticatedRoute.extend(styleBody, {
        titleToken: 'User',
    
        classNames: ['settings-view-user'],
    
        model: function (params) {
            var self = this;
            // TODO: Make custom user adapter that uses /api/users/:slug endpoint
            // return this.store.find('user', { slug: params.slug });
    
            // Instead, get all the users and then find by slug
            return this.store.find('user').then(function (result) {
                var user = result.findBy('slug', params.slug);
    
                if (!user) {
                    return self.transitionTo('error404', 'settings/users/' + params.slug);
                }
    
                return user;
            });
        },
    
        afterModel: function (user) {
            var self = this;
            this.store.find('user', 'me').then(function (currentUser) {
                var isOwnProfile = user.get('id') === currentUser.get('id'),
                    isAuthor = currentUser.get('isAuthor'),
                    isEditor = currentUser.get('isEditor');
                if (isAuthor && !isOwnProfile) {
                    self.transitionTo('settings.users.user', currentUser);
                } else if (isEditor && !isOwnProfile && !user.get('isAuthor')) {
                    self.transitionTo('settings.users');
                }
            });
        },
    
        deactivate: function () {
            var model = this.modelFor('settings.users.user');
    
            // we want to revert any unsaved changes on exit
            if (model && model.get('isDirty')) {
                model.rollback();
            }
    
            this._super();
        },
    
        actions: {
            save: function () {
                this.get('controller').send('save');
            }
        }
    });
    
    __exports__["default"] = SettingsUserRoute;
  });
define("ghost/routes/setup", 
  ["ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var styleBody = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    
    var SetupRoute = Ember.Route.extend(styleBody, loadingIndicator, {
        titleToken: 'Setup',
    
        classNames: ['ghost-setup'],
    
        // use the beforeModel hook to check to see whether or not setup has been
        // previously completed.  If it has, stop the transition into the setup page.
    
        beforeModel: function () {
            var self = this;
    
            // If user is logged in, setup has already been completed.
            if (this.get('session').isAuthenticated) {
                this.transitionTo(SimpleAuth.Configuration.routeAfterAuthentication);
                return;
            }
    
            // If user is not logged in, check the state of the setup process via the API
            return ic.ajax.request(this.get('ghostPaths.url').api('authentication/setup'), {
                type: 'GET'
            }).then(function (result) {
                var setup = result.setup[0].status;
    
                if (setup) {
                    return self.transitionTo('signin');
                }
            });
        }
    });
    
    __exports__["default"] = SetupRoute;
  });
define("ghost/routes/signin", 
  ["ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var styleBody = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    
    var SigninRoute = Ember.Route.extend(styleBody, loadingIndicator, {
        titleToken: 'Sign In',
    
        classNames: ['ghost-login'],
    
        beforeModel: function () {
            if (this.get('session').isAuthenticated) {
                this.transitionTo(SimpleAuth.Configuration.routeAfterAuthentication);
            }
        },
    
        // the deactivate hook is called after a route has been exited.
        deactivate: function () {
            this._super();
    
            // clear the properties that hold the credentials from the controller
            // when we're no longer on the signin screen
            this.controllerFor('signin').setProperties({identification: '', password: ''});
        }
    });
    
    __exports__["default"] = SigninRoute;
  });
define("ghost/routes/signout", 
  ["ghost/routes/authenticated","ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var AuthenticatedRoute = __dependency1__["default"];

    var styleBody = __dependency2__["default"];

    var loadingIndicator = __dependency3__["default"];

    
    var SignoutRoute = AuthenticatedRoute.extend(styleBody, loadingIndicator, {
        titleToken: 'Sign Out',
    
        classNames: ['ghost-signout'],
    
        afterModel: function (model, transition) {
            this.notifications.clear();
            if (Ember.canInvoke(transition, 'send')) {
                transition.send('invalidateSession');
                transition.abort();
            } else {
                this.send('invalidateSession');
            }
        }
    });
    
    __exports__["default"] = SignoutRoute;
  });
define("ghost/routes/signup", 
  ["ghost/mixins/style-body","ghost/mixins/loading-indicator","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var styleBody = __dependency1__["default"];

    var loadingIndicator = __dependency2__["default"];

    
    var SignupRoute = Ember.Route.extend(styleBody, loadingIndicator, {
        classNames: ['ghost-signup'],
        beforeModel: function () {
            if (this.get('session').isAuthenticated) {
                this.notifications.showWarn('You need to sign out to register as a new user.', {delayed: true});
                this.transitionTo(SimpleAuth.Configuration.routeAfterAuthentication);
            }
        },
    
        model: function (params) {
            var self = this,
                tokenText,
                email,
                model = {},
                re = /^(?:[A-Za-z0-9_\-]{4})*(?:[A-Za-z0-9_\-]{2}|[A-Za-z0-9_\-]{3})?$/;
    
            return new Ember.RSVP.Promise(function (resolve) {
                if (!re.test(params.token)) {
                    self.notifications.showError('Invalid token.', {delayed: true});
    
                    return resolve(self.transitionTo('signin'));
                }
    
                tokenText = atob(params.token);
                email = tokenText.split('|')[1];
    
                model.email = email;
                model.token = params.token;
    
                return ic.ajax.request({
                    url: self.get('ghostPaths.url').api('authentication', 'invitation'),
                    type: 'GET',
                    dataType: 'json',
                    data: {
                        email: email
                    }
                }).then(function (response) {
                    if (response && response.invitation && response.invitation[0].valid === false) {
                        self.notifications.showError('The invitation does not exist or is no longer valid.', {delayed: true});
    
                        return resolve(self.transitionTo('signin'));
                    }
    
                    resolve(model);
                }).catch(function () {
                    resolve(model);
                });
            });
        },
    
        deactivate: function () {
            this._super();
    
            // clear the properties that hold the sensitive data from the controller
            this.controllerFor('signup').setProperties({email: '', password: '', token: ''});
        }
    });
    
    __exports__["default"] = SignupRoute;
  });
define("ghost/serializers/application", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ApplicationSerializer = DS.RESTSerializer.extend({
        serializeIntoHash: function (hash, type, record, options) {
            // Our API expects an id on the posted object
            options = options || {};
            options.includeId = true;
    
            // We have a plural root in the API
            var root = Ember.String.pluralize(type.typeKey),
                data = this.serialize(record, options);
    
            // Don't ever pass uuid's
            delete data.uuid;
    
            hash[root] = [data];
        }
    });
    
    __exports__["default"] = ApplicationSerializer;
  });
define("ghost/serializers/post", 
  ["ghost/serializers/application","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ApplicationSerializer = __dependency1__["default"];

    
    var PostSerializer = ApplicationSerializer.extend(DS.EmbeddedRecordsMixin, {
        // settings for the EmbeddedRecordsMixin.
        attrs: {
            tags: {embedded: 'always'}
        },
    
        normalize: function (type, hash) {
            // this is to enable us to still access the raw author_id
            // without requiring an extra get request (since it is an
            // async relationship).
            hash.author_id = hash.author;
    
            return this._super(type, hash);
        },
    
        extractSingle: function (store, primaryType, payload) {
            var root = this.keyForAttribute(primaryType.typeKey),
                pluralizedRoot = Ember.String.pluralize(primaryType.typeKey);
    
            // make payload { post: { title: '', tags: [obj, obj], etc. } }.
            // this allows ember-data to pull the embedded tags out again,
            // in the function `updatePayloadWithEmbeddedHasMany` of the
            // EmbeddedRecordsMixin (line: `if (!partial[attribute])`):
            // https://github.com/emberjs/data/blob/master/packages/activemodel-adapter/lib/system/embedded_records_mixin.js#L499
            payload[root] = payload[pluralizedRoot][0];
            delete payload[pluralizedRoot];
    
            return this._super.apply(this, arguments);
        },
    
        keyForAttribute: function (attr) {
            return attr;
        },
    
        keyForRelationship: function (relationshipName) {
            // this is a hack to prevent Ember-Data from deleting our `tags` reference.
            // ref: https://github.com/emberjs/data/issues/2051
            // @TODO: remove this once the situation becomes clearer what to do.
            if (relationshipName === 'tags') {
                return 'tag';
            }
    
            return relationshipName;
        },
    
        serializeIntoHash: function (hash, type, record, options) {
            options = options || {};
    
            // We have a plural root in the API
            var root = Ember.String.pluralize(type.typeKey),
                data = this.serialize(record, options);
    
            // Properties that exist on the model but we don't want sent in the payload
    
            delete data.uuid;
            delete data.html;
            // Inserted locally as a convenience.
            delete data.author_id;
            // Read-only virtual property.
            delete data.url;
    
            hash[root] = [data];
        }
    });
    
    __exports__["default"] = PostSerializer;
  });
define("ghost/serializers/setting", 
  ["ghost/serializers/application","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ApplicationSerializer = __dependency1__["default"];

    
    var SettingSerializer = ApplicationSerializer.extend({
        serializeIntoHash: function (hash, type, record, options) {
            // Settings API does not want ids
            options = options || {};
            options.includeId = false;
    
            var root = Ember.String.pluralize(type.typeKey),
                data = this.serialize(record, options),
                payload = [];
    
            delete data.id;
    
            Object.keys(data).forEach(function (k) {
                payload.push({key: k, value: data[k]});
            });
    
            hash[root] = payload;
        },
    
        extractArray: function (store, type, _payload) {
            var payload = {id: '0'};
    
            _payload.settings.forEach(function (setting) {
                payload[setting.key] = setting.value;
            });
    
            return [payload];
        },
    
        extractSingle: function (store, type, payload) {
            return this.extractArray(store, type, payload).pop();
        }
    });
    
    __exports__["default"] = SettingSerializer;
  });
define("ghost/serializers/user", 
  ["ghost/serializers/application","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ApplicationSerializer = __dependency1__["default"];

    
    var UserSerializer = ApplicationSerializer.extend(DS.EmbeddedRecordsMixin, {
        attrs: {
            roles: {embedded: 'always'}
        },
    
        extractSingle: function (store, primaryType, payload) {
            var root = this.keyForAttribute(primaryType.typeKey),
                pluralizedRoot = Ember.String.pluralize(primaryType.typeKey);
    
            payload[root] = payload[pluralizedRoot][0];
            delete payload[pluralizedRoot];
    
            return this._super.apply(this, arguments);
        },
    
        keyForAttribute: function (attr) {
            return attr;
        },
    
        keyForRelationship: function (relationshipName) {
            // this is a hack to prevent Ember-Data from deleting our `tags` reference.
            // ref: https://github.com/emberjs/data/issues/2051
            // @TODO: remove this once the situation becomes clearer what to do.
            if (relationshipName === 'roles') {
                return 'role';
            }
    
            return relationshipName;
        }
    });
    
    __exports__["default"] = UserSerializer;
  });
define("ghost/transforms/moment-date", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global moment */
    var MomentDate = DS.Transform.extend({
        deserialize: function (serialized) {
            if (serialized) {
                return moment(serialized);
            }
            return serialized;
        },
        serialize: function (deserialized) {
            if (deserialized) {
                return moment(deserialized).toDate();
            }
            return deserialized;
        }
    });
    __exports__["default"] = MomentDate;
  });
define("ghost/utils/ajax", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global ic */
    
    var ajax = window.ajax = function () {
        return ic.ajax.request.apply(null, arguments);
    };
    
    // Used in API request fail handlers to parse a standard api error
    // response json for the message to display
    function getRequestErrorMessage(request, performConcat) {
        var message,
            msgDetail;
    
        // Can't really continue without a request
        if (!request) {
            return null;
        }
    
        // Seems like a sensible default
        message = request.statusText;
    
        // If a non 200 response
        if (request.status !== 200) {
            try {
                // Try to parse out the error, or default to 'Unknown'
                if (request.responseJSON.errors && Ember.isArray(request.responseJSON.errors)) {
                    message = request.responseJSON.errors.map(function (errorItem) {
                        return errorItem.message;
                    });
                } else {
                    message =  request.responseJSON.error || 'Unknown Error';
                }
            } catch (e) {
                msgDetail = request.status ? request.status + ' - ' + request.statusText : 'Server was not available';
                message = 'The server returned an error (' + msgDetail + ').';
            }
        }
    
        if (performConcat && Ember.isArray(message)) {
            message = message.join('<br />');
        }
    
        // return an array of errors by default
        if (!performConcat && typeof message === 'string') {
            message = [message];
        }
    
        return message;
    }
    
    __exports__.getRequestErrorMessage = getRequestErrorMessage;
    __exports__.ajax = ajax;

    __exports__["default"] = ajax;
  });
define("ghost/utils/bind", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var slice = Array.prototype.slice;
    
    function bind(/* func, args, thisArg */) {
        var args = slice.call(arguments),
            func = args.shift(),
            thisArg = args.pop();
    
        function bound() {
            return func.apply(thisArg, args);
        }
    
        return bound;
    }
    
    __exports__["default"] = bind;
  });
define("ghost/utils/bound-one-way", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * Defines a property similarly to `Ember.computed.oneway`,
     * save that while a `oneway` loses its binding upon being set,
     * the `BoundOneWay` will continue to listen for upstream changes.
     *
     * This is an ideal tool for working with values inside of {{input}}
     * elements.
     * @param {*} upstream
     * @param {function} transform a function to transform the **upstream** value.
     */
    var BoundOneWay = function (upstream, transform) {
        if (typeof transform !== 'function') {
            // default to the identity function
            transform = function (value) { return value; };
        }
    
        return Ember.computed(upstream, function (key, value) {
            return arguments.length > 1 ? value : transform(this.get(upstream));
        });
    };
    
    __exports__["default"] = BoundOneWay;
  });
define("ghost/utils/caja-sanitizers", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * google-caja uses url() and id() to verify if the values are allowed.
     */
    var url,
        id;
    
    /**
     * Check if URL is allowed
     * URLs are allowed if they start with http://, https://, or /.
     */
    url = function (url) {
        // jscs:disable
        url = url.toString().replace(/['"]+/g, '');
        if (/^https?:\/\//.test(url) || /^\//.test(url)) {
            return url;
        }
        // jscs:enable
    };
    
    /**
     * Check if ID is allowed
     * All ids are allowed at the moment.
     */
    id = function (id) {
        return id;
    };
    
    __exports__["default"] = {
        url: url,
        id: id
    };
  });
define("ghost/utils/codemirror-mobile", 
  ["ghost/assets/lib/touch-editor","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /*global CodeMirror, device, FastClick*/
    var createTouchEditor = __dependency1__["default"];

    
    var setupMobileCodeMirror,
        TouchEditor,
        init;
    
    setupMobileCodeMirror = function setupMobileCodeMirror() {
        var noop = function () {},
            key;
    
        for (key in CodeMirror) {
            if (CodeMirror.hasOwnProperty(key)) {
                CodeMirror[key] = noop;
            }
        }
    
        CodeMirror.fromTextArea = function (el, options) {
            return new TouchEditor(el, options);
        };
    
        CodeMirror.keyMap = {basic: {}};
    };
    
    init = function init() {
        // Codemirror does not function on mobile devices, or on any iDevice
        if (device.mobile() || (device.tablet() && device.ios())) {
            $('body').addClass('touch-editor');
    
            Ember.touchEditor = true;
    
            // initialize FastClick to remove touch delays
            Ember.run.scheduleOnce('afterRender', null, function () {
                FastClick.attach(document.body);
            });
    
            TouchEditor = createTouchEditor();
            setupMobileCodeMirror();
        }
    };
    
    __exports__["default"] = {
        createIfMobile: init
    };
  });
define("ghost/utils/codemirror-shortcuts", 
  ["ghost/utils/titleize","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global CodeMirror, moment, Showdown */
    // jscs:disable disallowSpacesInsideParentheses
    
    /** Set up a shortcut function to be called via router actions.
     *  See editor-base-route
     */
    
    var titleize = __dependency1__["default"];

    
    function init() {
        // remove predefined `ctrl+h` shortcut
        delete CodeMirror.keyMap.emacsy['Ctrl-H'];
    
        // Used for simple, noncomputational replace-and-go! shortcuts.
        // See default case in shortcut function below.
        CodeMirror.prototype.simpleShortcutSyntax = {
            bold: '**$1**',
            italic: '*$1*',
            strike: '~~$1~~',
            code: '`$1`',
            link: '[$1](http://)',
            image: '![$1](http://)',
            blockquote: '> $1'
        };
    
        CodeMirror.prototype.shortcut = function (type) {
            var text = this.getSelection(),
                cursor = this.getCursor(),
                line = this.getLine(cursor.line),
                fromLineStart = {line: cursor.line, ch: 0},
                toLineEnd = {line: cursor.line, ch: line.length},
                md, letterCount, textIndex, position, converter,
                generatedHTML, match, currentHeaderLevel, hashPrefix,
                replacementLine;
    
            switch (type) {
            case 'cycleHeaderLevel':
                match = line.match(/^#+/);
    
                if (!match) {
                    currentHeaderLevel = 1;
                } else {
                    currentHeaderLevel = match[0].length;
                }
    
                if (currentHeaderLevel > 2) {
                    currentHeaderLevel = 1;
                }
    
                hashPrefix = new Array(currentHeaderLevel + 2).join('#');
    
                // jscs:disable
                replacementLine = hashPrefix + ' ' + line.replace(/^#* /, '');
                // jscs:enable
    
                this.replaceRange(replacementLine, fromLineStart, toLineEnd);
                this.setCursor(cursor.line, cursor.ch + replacementLine.length);
                break;
    
            case 'link':
                md = this.simpleShortcutSyntax.link.replace('$1', text);
                this.replaceSelection(md, 'end');
                if (!text) {
                    this.setCursor(cursor.line, cursor.ch + 1);
                } else {
                    textIndex = line.indexOf(text, cursor.ch - text.length);
                    position = textIndex + md.length - 1;
                    this.setSelection({
                        line: cursor.line,
                        ch: position - 7
                    }, {
                        line: cursor.line,
                        ch: position
                    });
                }
                return;
    
            case 'image':
                md = this.simpleShortcutSyntax.image.replace('$1', text);
                if (line !== '') {
                    md = '\n\n' + md;
                }
                this.replaceSelection(md, 'end');
                cursor = this.getCursor();
                this.setSelection({line: cursor.line, ch: cursor.ch - 8}, {line: cursor.line, ch: cursor.ch - 1});
                return;
    
            case 'list':
                // jscs:disable
                md = text.replace(/^(\s*)(\w\W*)/gm, '$1* $2');
                // jscs:enable
                this.replaceSelection(md, 'end');
                return;
    
            case 'currentDate':
                md = moment(new Date()).format('D MMMM YYYY');
                this.replaceSelection(md, 'end');
                return;
    
            case 'uppercase':
                md = text.toLocaleUpperCase();
                break;
    
            case 'lowercase':
                md = text.toLocaleLowerCase();
                break;
    
            case 'titlecase':
                md = titleize(text);
                break;
    
            case 'copyHTML':
                converter = new Showdown.converter();
    
                if (text) {
                    generatedHTML = converter.makeHtml(text);
                } else {
                    generatedHTML = converter.makeHtml(this.getValue());
                }
    
                // Talk to Ember
                this.component.sendAction('openModal', 'copy-html', {generatedHTML: generatedHTML});
    
                break;
    
            default:
                if (this.simpleShortcutSyntax[type]) {
                    md = this.simpleShortcutSyntax[type].replace('$1', text);
                }
            }
            if (md) {
                this.replaceSelection(md, 'end');
                if (!text) {
                    letterCount = md.length;
                    this.setCursor({
                        line: cursor.line,
                        ch: cursor.ch + (letterCount / 2)
                    });
                }
            }
        };
    }
    
    __exports__["default"] = {
        init: init
    };
  });
define("ghost/utils/config-parser", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var isNumeric = function (num) {
            return !isNaN(num);
        },
    
        _mapType = function (val) {
            if (val === '') {
                return null;
            } else if (val === 'true') {
                return true;
            } else if (val === 'false') {
                return false;
            } else if (isNumeric(val)) {
                return +val;
            } else {
                return val;
            }
        },
    
        parseConfiguration = function () {
            var metaConfigTags = $('meta[name^="env-"]'),
                propertyName,
                config = {},
                value,
                key,
                i;
    
            for (i = 0; i < metaConfigTags.length; i += 1) {
                key = $(metaConfigTags[i]).prop('name');
                value = $(metaConfigTags[i]).prop('content');
                propertyName = key.substring(4);        // produce config name ignoring the initial 'env-'.
                config[propertyName] = _mapType(value); // map string values to types if possible
            }
            return config;
        };
    
    __exports__["default"] = parseConfiguration;
  });
define("ghost/utils/ctrl-or-cmd", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ctrlOrCmd = navigator.userAgent.indexOf('Mac') !== -1 ? 'command' : 'ctrl';
    
    __exports__["default"] = ctrlOrCmd;
  });
define("ghost/utils/date-formatting", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global moment */
    // jscs: disable disallowSpacesInsideParentheses
    
    var parseDateFormats,
        displayDateFormat,
        verifyTimeStamp,
        parseDateString,
        formatDate;
    
    parseDateFormats = ['DD MMM YY @ HH:mm', 'DD MMM YY HH:mm',
                            'DD MMM YYYY @ HH:mm', 'DD MMM YYYY HH:mm',
                            'DD/MM/YY @ HH:mm', 'DD/MM/YY HH:mm',
                            'DD/MM/YYYY @ HH:mm', 'DD/MM/YYYY HH:mm',
                            'DD-MM-YY @ HH:mm', 'DD-MM-YY HH:mm',
                            'DD-MM-YYYY @ HH:mm', 'DD-MM-YYYY HH:mm',
                            'YYYY-MM-DD @ HH:mm', 'YYYY-MM-DD HH:mm',
                            'DD MMM @ HH:mm', 'DD MMM HH:mm'];
    
    displayDateFormat = 'DD MMM YY @ HH:mm';
    
    // Add missing timestamps
    verifyTimeStamp = function (dateString) {
        if (dateString && !dateString.slice(-5).match(/\d+:\d\d/)) {
            dateString += ' 12:00';
        }
        return dateString;
    };
    
    // Parses a string to a Moment
    parseDateString = function (value) {
        return value ? moment(verifyTimeStamp(value), parseDateFormats, true) : undefined;
    };
    
    // Formats a Date or Moment
    formatDate = function (value) {
        return verifyTimeStamp(value ? moment(value).format(displayDateFormat) : '');
    };
    
    __exports__.parseDateString = parseDateString;
    __exports__.formatDate = formatDate;
  });
define("ghost/utils/document-title", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var documentTitle = function () {
        Ember.Route.reopen({
            // `titleToken` can either be a static string or a function
            // that accepts a model object and returns a string (or array
            // of strings if there are multiple tokens).
            titleToken: null,
    
            // `title` can either be a static string or a function
            // that accepts an array of tokens and returns a string
            // that will be the document title. The `collectTitleTokens` action
            // stops bubbling once a route is encountered that has a `title`
            // defined.
            title: null,
    
            _actions: {
                collectTitleTokens: function (tokens) {
                    var titleToken = this.titleToken,
                        finalTitle;
    
                    if (typeof this.titleToken === 'function') {
                        titleToken = this.titleToken(this.currentModel);
                    }
    
                    if (Ember.isArray(titleToken)) {
                        tokens.unshift.apply(this, titleToken);
                    } else if (titleToken) {
                        tokens.unshift(titleToken);
                    }
    
                    if (this.title) {
                        if (typeof this.title === 'function') {
                            finalTitle = this.title(tokens);
                        } else {
                            finalTitle = this.title;
                        }
    
                        this.router.setTitle(finalTitle);
                    } else {
                        return true;
                    }
                }
            }
        });
    
        Ember.Router.reopen({
            updateTitle: function () {
                this.send('collectTitleTokens', []);
            }.on('didTransition'),
    
            setTitle: function (title) {
                if (Ember.testing) {
                    this._title = title;
                } else {
                    window.document.title = title;
                }
            }
        });
    };
    
    __exports__["default"] = documentTitle;
  });
define("ghost/utils/dropdown-service", 
  ["ghost/mixins/body-event-listener","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    // This is used by the dropdown initializer (and subsequently popovers) to manage closing & toggling
    var BodyEventListener = __dependency1__["default"];

    
    var DropdownService = Ember.Object.extend(Ember.Evented, BodyEventListener, {
        bodyClick: function (event) {
            /*jshint unused:false */
            this.closeDropdowns();
        },
        closeDropdowns: function () {
            this.trigger('close');
        },
        toggleDropdown: function (dropdownName, dropdownButton) {
            this.trigger('toggle', {target: dropdownName, button: dropdownButton});
        }
    });
    
    __exports__["default"] = DropdownService;
  });
define("ghost/utils/editor-shortcuts", 
  ["ghost/utils/ctrl-or-cmd","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var ctrlOrCmd = __dependency1__["default"];

    
    var shortcuts = {};
    
    // General editor shortcuts
    shortcuts[ctrlOrCmd + '+alt+p'] = 'publish';
    shortcuts['alt+shift+z'] = 'toggleZenMode';
    
    // CodeMirror Markdown Shortcuts
    
    // Text
    shortcuts['ctrl+alt+u'] = {action: 'codeMirrorShortcut', options: {type: 'strike'}};
    shortcuts[ctrlOrCmd + '+b'] = {action: 'codeMirrorShortcut', options: {type: 'bold'}};
    shortcuts[ctrlOrCmd + '+i'] = {action: 'codeMirrorShortcut', options: {type: 'italic'}};
    
    shortcuts['ctrl+u'] = {action: 'codeMirrorShortcut', options: {type: 'uppercase'}};
    shortcuts['ctrl+shift+u'] = {action: 'codeMirrorShortcut', options: {type: 'lowercase'}};
    shortcuts['ctrl+alt+shift+u'] = {action: 'codeMirrorShortcut', options: {type: 'titlecase'}};
    shortcuts[ctrlOrCmd + '+shift+c'] = {action: 'codeMirrorShortcut', options: {type: 'copyHTML'}};
    shortcuts[ctrlOrCmd + '+h'] = {action: 'codeMirrorShortcut', options: {type: 'cycleHeaderLevel'}};
    
    // Formatting
    shortcuts['ctrl+q'] = {action: 'codeMirrorShortcut', options: {type: 'blockquote'}};
    shortcuts['ctrl+l'] = {action: 'codeMirrorShortcut', options: {type: 'list'}};
    
    // Insert content
    shortcuts['ctrl+shift+1'] = {action: 'codeMirrorShortcut', options: {type: 'currentDate'}};
    shortcuts[ctrlOrCmd + '+k'] = {action: 'codeMirrorShortcut', options: {type: 'link'}};
    shortcuts[ctrlOrCmd + '+shift+i'] = {action: 'codeMirrorShortcut', options: {type: 'image'}};
    shortcuts[ctrlOrCmd + '+shift+k'] = {action: 'codeMirrorShortcut', options: {type: 'code'}};
    
    __exports__["default"] = shortcuts;
  });
define("ghost/utils/ghost-paths", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var makeRoute = function (root, args) {
        var slashAtStart,
            slashAtEnd,
            parts,
            route;
    
        slashAtStart = /^\//;
        slashAtEnd = /\/$/;
        route = root.replace(slashAtEnd, '');
        parts = Array.prototype.slice.call(args, 0);
    
        parts.forEach(function (part) {
            route = [route, part.replace(slashAtStart, '').replace(slashAtEnd, '')].join('/');
        });
        return route += '/';
    };
    
    function ghostPaths() {
        var path = window.location.pathname,
            subdir = path.substr(0, path.search('/ghost/')),
            adminRoot = subdir + '/ghost',
            apiRoot = subdir + '/ghost/api/v0.1';
    
        function assetUrl(src) {
            return subdir + src;
        }
    
        return {
            subdir: subdir,
            blogRoot: subdir + '/',
            adminRoot: adminRoot,
            apiRoot: apiRoot,
    
            url: {
                admin: function () {
                    return makeRoute(adminRoot, arguments);
                },
    
                api: function () {
                    return makeRoute(apiRoot, arguments);
                },
    
                join: function () {
                    if (arguments.length > 1) {
                        return makeRoute(arguments[0], Array.prototype.slice.call(arguments, 1));
                    } else if (arguments.length === 1) {
                        var arg = arguments[0];
                        return arg.slice(-1) === '/' ? arg : arg + '/';
                    }
                    return '/';
                },
    
                asset: assetUrl
            }
        };
    }
    
    __exports__["default"] = ghostPaths;
  });
define("ghost/utils/isFinite", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* globals window */
    
    // isFinite function from lodash
    
    function isFinite(value) {
        return window.isFinite(value) && !window.isNaN(parseFloat(value));
    }
    
    __exports__["default"] = isFinite;
  });
define("ghost/utils/isNumber", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // isNumber function from lodash
    
    var toString = Object.prototype.toString;
    
    function isNumber(value) {
        return typeof value === 'number' ||
          value && typeof value === 'object' && toString.call(value) === '[object Number]' || false;
    }
    
    __exports__["default"] = isNumber;
  });
define("ghost/utils/link-view", 
  [],
  function() {
    "use strict";
    Ember.LinkView.reopen({
        active: Ember.computed('resolvedParams', 'routeArgs', function () {
            var isActive = this._super();
    
            Ember.set(this, 'alternateActive', isActive);
    
            return isActive;
        }),
    
        activeClass: Ember.computed('tagName', function () {
            return this.get('tagName') === 'button' ? '' : 'active';
        })
    });
  });
define("ghost/utils/mobile", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var mobileQuery = matchMedia('(max-width: 900px)');
    
    __exports__["default"] = mobileQuery;
  });
define("ghost/utils/notifications", 
  ["ghost/models/notification","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var Notification = __dependency1__["default"];

    
    var Notifications = Ember.ArrayProxy.extend({
        delayedNotifications: [],
        content: Ember.A(),
        timeout: 3000,
    
        pushObject: function (object) {
            // object can be either a DS.Model or a plain JS object, so when working with
            // it, we need to handle both cases.
    
            // make sure notifications have all the necessary properties set.
            if (typeof object.toJSON === 'function') {
                // working with a DS.Model
    
                if (object.get('location') === '') {
                    object.set('location', 'bottom');
                }
            } else {
                if (!object.location) {
                    object.location = 'bottom';
                }
            }
    
            this._super(object);
        },
        handleNotification: function (message, delayed) {
            if (!message.status) {
                message.status = 'passive';
            }
    
            if (!delayed) {
                this.pushObject(message);
            } else {
                this.delayedNotifications.push(message);
            }
        },
        showError: function (message, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            this.handleNotification({
                type: 'error',
                message: message
            }, options.delayed);
        },
        showErrors: function (errors, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            for (var i = 0; i < errors.length; i += 1) {
                this.showError(errors[i].message || errors[i], {doNotClosePassive: true});
            }
        },
        showAPIError: function (resp, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            options.defaultErrorText = options.defaultErrorText || 'There was a problem on the server, please try again.';
    
            if (resp && resp.jqXHR && resp.jqXHR.responseJSON && resp.jqXHR.responseJSON.error) {
                this.showError(resp.jqXHR.responseJSON.error, options);
            } else if (resp && resp.jqXHR && resp.jqXHR.responseJSON && resp.jqXHR.responseJSON.errors) {
                this.showErrors(resp.jqXHR.responseJSON.errors, options);
            } else if (resp && resp.jqXHR && resp.jqXHR.responseJSON && resp.jqXHR.responseJSON.message) {
                this.showError(resp.jqXHR.responseJSON.message, options);
            } else {
                this.showError(options.defaultErrorText, {doNotClosePassive: true});
            }
        },
        showInfo: function (message, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            this.handleNotification({
                type: 'info',
                message: message
            }, options.delayed);
        },
        showSuccess: function (message, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            this.handleNotification({
                type: 'success',
                message: message
            }, options.delayed);
        },
        showWarn: function (message, options) {
            options = options || {};
    
            if (!options.doNotClosePassive) {
                this.closePassive();
            }
    
            this.handleNotification({
                type: 'warn',
                message: message
            }, options.delayed);
        },
        displayDelayed: function () {
            var self = this;
    
            self.delayedNotifications.forEach(function (message) {
                self.pushObject(message);
            });
            self.delayedNotifications = [];
        },
        closeNotification: function (notification) {
            var self = this;
    
            if (notification instanceof Notification) {
                notification.deleteRecord();
                notification.save().finally(function () {
                    self.removeObject(notification);
                });
            } else {
                this.removeObject(notification);
            }
        },
        closePassive: function () {
            this.set('content', this.rejectBy('status', 'passive'));
        },
        closePersistent: function () {
            this.set('content', this.rejectBy('status', 'persistent'));
        },
        closeAll: function () {
            this.clear();
        }
    });
    
    __exports__["default"] = Notifications;
  });
define("ghost/utils/set-scroll-classname", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // ## scrollShadow
    // This adds a 'scroll' class to the targeted element when the element is scrolled
    // `this` is expected to be a jQuery-wrapped element
    // **target:** The element in which the class is applied. Defaults to scrolled element.
    // **class-name:** The class which is applied.
    // **offset:** How far the user has to scroll before the class is applied.
    var setScrollClassName = function (options) {
        var $target = options.target || this,
            offset = options.offset,
            className = options.className || 'scrolling';
    
        if (this.scrollTop() > offset) {
            $target.addClass(className);
        } else {
            $target.removeClass(className);
        }
    };
    
    __exports__["default"] = setScrollClassName;
  });
define("ghost/utils/text-field", 
  [],
  function() {
    "use strict";
    Ember.TextField.reopen({
        attributeBindings: ['autofocus']
    });
  });
define("ghost/utils/titleize", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var lowerWords = ['of', 'a', 'the', 'and', 'an', 'or', 'nor', 'but', 'is', 'if',
                      'then', 'else', 'when', 'at', 'from', 'by', 'on', 'off', 'for',
                      'in', 'out', 'over', 'to', 'into', 'with'];
    
    function titleize(input) {
        var words = input.split(' ').map(function (word, index) {
            if (index === 0 || lowerWords.indexOf(word) === -1) {
                word = Ember.String.capitalize(word);
            }
    
            return word;
        });
    
        return words.join(' ');
    }
    
    __exports__["default"] = titleize;
  });
define("ghost/utils/validator-extensions", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function init() {
        // Provide a few custom validators
        //
        validator.extend('empty', function (str) {
            return Ember.isBlank(str);
        });
    
        validator.extend('notContains', function (str, badString) {
            return str.indexOf(badString) === -1;
        });
    }
    
    __exports__["default"] = {
        init: init
    };
  });
define("ghost/utils/word-count", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // jscs: disable
    function wordCount(s) {
        s = s.replace(/(^\s*)|(\s*$)/gi, ''); // exclude  start and end white-space
        s = s.replace(/[ ]{2,}/gi, ' '); // 2 or more space to 1
        s = s.replace(/\n /gi, '\n'); // exclude newline with a start spacing
        s = s.replace(/\n+/gi, '\n');
    
        return s.split(/ |\n/).length;
    }
    
    __exports__["default"] = wordCount;
  });
define("ghost/validators/forgotten", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ForgotValidator = Ember.Object.create({
        check: function (model) {
            var data = model.getProperties('email'),
                validationErrors = [];
    
            if (!validator.isEmail(data.email)) {
                validationErrors.push({
                    message: 'Invalid email address'
                });
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = ForgotValidator;
  });
define("ghost/validators/new-user", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var NewUserValidator = Ember.Object.extend({
        check: function (model) {
            var data = model.getProperties('name', 'email', 'password'),
                validationErrors = [];
    
            if (!validator.isLength(data.name, 1)) {
                validationErrors.push({
                    message: 'Please enter a name.'
                });
            }
    
            if (!validator.isEmail(data.email)) {
                validationErrors.push({
                    message: 'Invalid Email.'
                });
            }
    
            if (!validator.isLength(data.password, 8)) {
                validationErrors.push({
                    message: 'Password must be at least 8 characters long.'
                });
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = NewUserValidator;
  });
define("ghost/validators/post", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var PostValidator = Ember.Object.create({
        check: function (model) {
            var validationErrors = [],
                data = model.getProperties('title', 'meta_title', 'meta_description');
    
            if (validator.empty(data.title)) {
                validationErrors.push({
                    message: 'You must specify a title for the post.'
                });
            }
    
            if (!validator.isLength(data.meta_title, 0, 150)) {
                validationErrors.push({
                    message: 'Meta Title cannot be longer than 150 characters.'
                });
            }
    
            if (!validator.isLength(data.meta_description, 0, 200)) {
                validationErrors.push({
                    message: 'Meta Description cannot be longer than 200 characters.'
                });
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = PostValidator;
  });
define("ghost/validators/reset", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ResetValidator = Ember.Object.create({
        check: function (model) {
            var p1 = model.get('newPassword'),
                p2 = model.get('ne2Password'),
                validationErrors = [];
    
            if (!validator.equals(p1, p2)) {
                validationErrors.push({
                    message: 'The two new passwords don\'t match.'
                });
            }
    
            if (!validator.isLength(p1, 8)) {
                validationErrors.push({
                    message: 'The password is not long enough.'
                });
            }
            return validationErrors;
        }
    });
    
    __exports__["default"] = ResetValidator;
  });
define("ghost/validators/setting", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SettingValidator = Ember.Object.create({
        check: function (model) {
            var validationErrors = [],
                title = model.get('title'),
                description = model.get('description'),
                email = model.get('email'),
                postsPerPage = model.get('postsPerPage');
    
            if (!validator.isLength(title, 0, 150)) {
                validationErrors.push({message: 'Title is too long'});
            }
    
            if (!validator.isLength(description, 0, 200)) {
                validationErrors.push({message: 'Description is too long'});
            }
    
            if (!validator.isEmail(email) || !validator.isLength(email, 0, 254)) {
                validationErrors.push({message: 'Supply a valid email address'});
            }
    
            if (postsPerPage > 1000) {
                validationErrors.push({message: 'The maximum number of posts per page is 1000'});
            }
    
            if (postsPerPage < 1) {
                validationErrors.push({message: 'The minimum number of posts per page is 1'});
            }
    
            if (!validator.isInt(postsPerPage)) {
                validationErrors.push({message: 'Posts per page must be a number'});
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = SettingValidator;
  });
define("ghost/validators/setup", 
  ["ghost/validators/new-user","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var NewUserValidator = __dependency1__["default"];

    
    var SetupValidator = NewUserValidator.extend({
        check: function (model) {
            var data = model.getProperties('blogTitle'),
                validationErrors = this._super(model);
    
            if (!validator.isLength(data.blogTitle, 1)) {
                validationErrors.push({
                    message: 'Please enter a blog title.'
                });
            }
    
            return validationErrors;
        }
    }).create();
    
    __exports__["default"] = SetupValidator;
  });
define("ghost/validators/signin", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SigninValidator = Ember.Object.create({
        check: function (model) {
            var data = model.getProperties('identification', 'password'),
                validationErrors = [];
    
            if (!validator.isEmail(data.identification)) {
                validationErrors.push('Invalid Email');
            }
    
            if (!validator.isLength(data.password || '', 1)) {
                validationErrors.push('Please enter a password');
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = SigninValidator;
  });
define("ghost/validators/signup", 
  ["ghost/validators/new-user","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var NewUserValidator = __dependency1__["default"];

    
    __exports__["default"] = NewUserValidator.create();
  });
define("ghost/validators/tag-settings", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var TagSettingsValidator = Ember.Object.create({
        check: function (model) {
            var validationErrors = [],
                data = model.getProperties('name', 'meta_title', 'meta_description');
    
            if (validator.empty(data.name)) {
                validationErrors.push({
                    message: 'You must specify a name for the tag.'
                });
            }
    
            if (!validator.isLength(data.meta_title, 0, 150)) {
                validationErrors.push({
                    message: 'Meta Title cannot be longer than 150 characters.'
                });
            }
    
            if (!validator.isLength(data.meta_description, 0, 200)) {
                validationErrors.push({
                    message: 'Meta Description cannot be longer than 200 characters.'
                });
            }
    
            return validationErrors;
        }
    });
    
    __exports__["default"] = TagSettingsValidator;
  });
define("ghost/validators/user", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var UserValidator = Ember.Object.create({
        check: function (model) {
            var validator = this.validators[model.get('status')];
    
            if (typeof validator !== 'function') {
                return [];
            }
    
            return validator(model);
        },
    
        validators: {
            invited: function (model) {
                var validationErrors = [],
                    email = model.get('email'),
                    roles = model.get('roles');
    
                if (!validator.isEmail(email)) {
                    validationErrors.push({message: 'Please supply a valid email address'});
                }
    
                if (roles.length < 1) {
                    validationErrors.push({message: 'Please select a role'});
                }
    
                return validationErrors;
            },
    
            active: function (model) {
                var validationErrors = [],
                    name = model.get('name'),
                    bio = model.get('bio'),
                    email = model.get('email'),
                    location = model.get('location'),
                    website = model.get('website');
    
                if (!validator.isLength(name, 0, 150)) {
                    validationErrors.push({message: 'Name is too long'});
                }
    
                if (!validator.isLength(bio, 0, 200)) {
                    validationErrors.push({message: 'Bio is too long'});
                }
    
                if (!validator.isEmail(email)) {
                    validationErrors.push({message: 'Please supply a valid email address'});
                }
    
                if (!validator.isLength(location, 0, 150)) {
                    validationErrors.push({message: 'Location is too long'});
                }
    
                if (!Ember.isEmpty(website) &&
                    (!validator.isURL(website, {require_protocol: false}) ||
                    !validator.isLength(website, 0, 2000))) {
                    validationErrors.push({message: 'Website is not a valid url'});
                }
    
                return validationErrors;
            }
        }
    });
    
    __exports__["default"] = UserValidator;
  });
define("ghost/views/application", 
  ["ghost/utils/mobile","ghost/utils/bind","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var mobileQuery = __dependency1__["default"];

    var bind = __dependency2__["default"];

    
    var ApplicationView = Ember.View.extend({
        elementId: 'container',
    
        setupGlobalMobileNav: function () {
            // #### Navigating within the sidebar closes it.
            var self = this;
            $('body').on('click tap', '.js-nav-item', function () {
                if (mobileQuery.matches) {
                    self.set('controller.showGlobalMobileNav', false);
                }
            });
    
            // #### Close the nav if mobile and clicking outside of the nav or not the burger toggle
            $('.js-nav-cover').on('click tap', function () {
                var isOpen = self.get('controller.showGlobalMobileNav');
                if (isOpen) {
                    self.set('controller.showGlobalMobileNav', false);
                }
            });
    
            // #### Listen to the viewport and change user-menu dropdown triangle classes accordingly
            mobileQuery.addListener(this.swapUserMenuDropdownTriangleClasses);
            this.swapUserMenuDropdownTriangleClasses(mobileQuery);
        }.on('didInsertElement'),
    
        swapUserMenuDropdownTriangleClasses: function (mq) {
            if (mq.matches) {
                $('.js-user-menu-dropdown-menu').removeClass('dropdown-triangle-top-right ').addClass('dropdown-triangle-bottom');
            } else {
                $('.js-user-menu-dropdown-menu').removeClass('dropdown-triangle-bottom').addClass('dropdown-triangle-top-right');
            }
        },
    
        showGlobalMobileNavObserver: function () {
            if (this.get('controller.showGlobalMobileNav')) {
                $('body').addClass('global-nav-expanded');
            } else {
                $('body').removeClass('global-nav-expanded');
            }
        }.observes('controller.showGlobalMobileNav'),
    
        setupCloseNavOnDesktop: function () {
            this.set('closeGlobalMobileNavOnDesktop', bind(function closeGlobalMobileNavOnDesktop(mq) {
                if (!mq.matches) {
                    // Is desktop sized
                    this.set('controller.showGlobalMobileNav', false);
                }
            }, this));
    
            mobileQuery.addListener(this.closeGlobalMobileNavOnDesktop);
        }.on('didInsertElement'),
    
        removeCloseNavOnDesktop: function () {
            mobileQuery.removeListener(this.closeGlobalMobileNavOnDesktop);
        }.on('willDestroyElement'),
    
        toggleSettingsMenuBodyClass: function () {
            $('body').toggleClass('settings-menu-expanded', this.get('controller.showSettingsMenu'));
        }.observes('controller.showSettingsMenu')
    });
    
    __exports__["default"] = ApplicationView;
  });
define("ghost/views/content-preview-content-view", 
  ["ghost/utils/set-scroll-classname","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var setScrollClassName = __dependency1__["default"];

    
    var PostContentView = Ember.View.extend({
        classNames: ['content-preview-content'],
    
        didInsertElement: function () {
            var el = this.$();
            el.on('scroll', Ember.run.bind(el, setScrollClassName, {
                target: el.closest('.content-preview'),
                offset: 10
            }));
        },
    
        contentObserver: function () {
            this.$().closest('.content-preview').scrollTop(0);
        }.observes('controller.content'),
    
        willDestroyElement: function () {
            var el = this.$();
            el.off('scroll');
        }
    });
    
    __exports__["default"] = PostContentView;
  });
define("ghost/views/editor-save-button", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var EditorSaveButtonView = Ember.View.extend({
        templateName: 'editor-save-button',
        tagName: 'section',
        classNames: ['splitbtn', 'js-publish-splitbutton'],
    
        // Tracks whether we're going to change the state of the post on save
        isDangerous: Ember.computed('controller.isPublished', 'controller.willPublish', function () {
            return this.get('controller.isPublished') !== this.get('controller.willPublish');
        }),
    
        publishText: Ember.computed('controller.isPublished', function () {
            return this.get('controller.isPublished') ? 'Update Post' : 'Publish Now';
        }),
    
        draftText: Ember.computed('controller.isPublished', function () {
            return this.get('controller.isPublished') ? 'Unpublish' : 'Save Draft';
        }),
    
        saveText: Ember.computed('controller.willPublish', function () {
            return this.get('controller.willPublish') ? this.get('publishText') : this.get('draftText');
        })
    });
    
    __exports__["default"] = EditorSaveButtonView;
  });
define("ghost/views/editor/edit", 
  ["ghost/mixins/editor-base-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EditorViewMixin = __dependency1__["default"];

    
    var EditorView = Ember.View.extend(EditorViewMixin, {
        tagName: 'section',
        classNames: ['entry-container']
    });
    
    __exports__["default"] = EditorView;
  });
define("ghost/views/editor/new", 
  ["ghost/mixins/editor-base-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var EditorViewMixin = __dependency1__["default"];

    
    var EditorNewView = Ember.View.extend(EditorViewMixin, {
        tagName: 'section',
        templateName: 'editor/edit',
        classNames: ['entry-container']
    });
    
    __exports__["default"] = EditorNewView;
  });
define("ghost/views/item-view", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var ItemView = Ember.View.extend({
        classNameBindings: ['active'],
    
        active: Ember.computed('childViews.firstObject.active', function () {
            return this.get('childViews.firstObject.active');
        })
    });
    
    __exports__["default"] = ItemView;
  });
define("ghost/views/mobile/content-view", 
  ["ghost/utils/mobile","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var mobileQuery = __dependency1__["default"];

    
    var MobileContentView = Ember.View.extend({
        // Ensure that loading this view brings it into view on mobile
        showContent: function () {
            if (mobileQuery.matches) {
                this.get('parentView').showContent();
            }
        }.on('didInsertElement')
    });
    
    __exports__["default"] = MobileContentView;
  });
define("ghost/views/mobile/index-view", 
  ["ghost/utils/mobile","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var mobileQuery = __dependency1__["default"];

    
    var MobileIndexView = Ember.View.extend({
        // Ensure that going to the index brings the menu into view on mobile.
        showMenu: function () {
            if (mobileQuery.matches) {
                this.get('parentView').showMenu();
            }
        }.on('didInsertElement')
    });
    
    __exports__["default"] = MobileIndexView;
  });
define("ghost/views/mobile/parent-view", 
  ["ghost/utils/mobile","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var mobileQuery = __dependency1__["default"];

    
    // A mobile parent view needs to implement three methods,
    // showContent, showAll, and showMenu
    // Which are called by MobileIndex and MobileContent views
    var MobileParentView = Ember.View.extend({
        showContent: Ember.K,
        showMenu: Ember.K,
        showAll: Ember.K,
    
        setChangeLayout: function () {
            var self = this;
            this.set('changeLayout', function changeLayout() {
                if (mobileQuery.matches) {
                    // transitioned to mobile layout, so show content
                    self.showContent();
                } else {
                    // went from mobile to desktop
                    self.showAll();
                }
            });
        }.on('init'),
    
        attachChangeLayout: function () {
            mobileQuery.addListener(this.changeLayout);
        }.on('didInsertElement'),
    
        detachChangeLayout: function () {
            mobileQuery.removeListener(this.changeLayout);
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = MobileParentView;
  });
define("ghost/views/paginated-scroll-box", 
  ["ghost/utils/set-scroll-classname","ghost/mixins/pagination-view-infinite-scroll","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var setScrollClassName = __dependency1__["default"];

    var PaginationViewMixin = __dependency2__["default"];

    
    var PaginatedScrollBox = Ember.View.extend(PaginationViewMixin, {
        attachScrollClassHandler: function () {
            var el = this.$();
            el.on('scroll', Ember.run.bind(el, setScrollClassName, {
                target: el.closest('.content-list'),
                offset: 10
            }));
        }.on('didInsertElement'),
    
        detachScrollClassHandler: function () {
            this.$().off('scroll');
        }.on('willDestroyElement')
    });
    
    __exports__["default"] = PaginatedScrollBox;
  });
define("ghost/views/post-item-view", 
  ["ghost/views/item-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var itemView = __dependency1__["default"];

    
    var PostItemView = itemView.extend({
        classNameBindings: ['isFeatured:featured', 'isPage:page'],
    
        isFeatured: Ember.computed.alias('controller.model.featured'),
    
        isPage: Ember.computed.alias('controller.model.page'),
    
        doubleClick: function () {
            this.get('controller').send('openEditor');
        },
    
        click: function () {
            this.get('controller').send('showPostContent');
        },
        scrollIntoView: function () {
            if (!this.get('active')) {
                return;
            }
            var element = this.$(),
                offset = element.offset().top,
                elementHeight = element.height(),
                container = Ember.$('.js-content-scrollbox'),
                containerHeight = container.height(),
                currentScroll = container.scrollTop(),
                isBelowTop,
                isAboveBottom,
                isOnScreen;
    
            isAboveBottom = offset < containerHeight;
            isBelowTop = offset > elementHeight;
    
            isOnScreen = isBelowTop && isAboveBottom;
    
            if (!isOnScreen) {
                // Scroll so that element is centered in container
                // 40 is the amount of padding on the container
                container.clearQueue().animate({
                    scrollTop: currentScroll + offset - 40 - containerHeight / 2
                });
            }
        },
        removeScrollBehaviour: function () {
            this.removeObserver('active', this, this.scrollIntoView);
        }.on('willDestroyElement'),
        addScrollBehaviour: function () {
            this.addObserver('active', this, this.scrollIntoView);
        }.on('didInsertElement')
    });
    
    __exports__["default"] = PostItemView;
  });
define("ghost/views/post-settings-menu", 
  ["ghost/utils/date-formatting","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global moment */
    var formatDate = __dependency1__.formatDate;

    
    var PostSettingsMenuView = Ember.View.extend({
        templateName: 'post-settings-menu',
    
        publishedAtBinding: Ember.Binding.oneWay('controller.publishedAt'),
    
        datePlaceholder: Ember.computed('controller.publishedAt', function () {
            return formatDate(moment());
        })
    });
    
    __exports__["default"] = PostSettingsMenuView;
  });
define("ghost/views/post-tags-input", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var PostTagsInputView = Ember.View.extend({
        tagName: 'section',
        elementId: 'entry-tags',
        classNames: 'publish-bar-inner',
        classNameBindings: ['hasFocus:focused'],
    
        templateName: 'post-tags-input',
    
        hasFocus: false,
    
        keys: {
            BACKSPACE: 8,
            TAB: 9,
            ENTER: 13,
            ESCAPE: 27,
            UP: 38,
            DOWN: 40,
            NUMPAD_ENTER: 108
        },
    
        didInsertElement: function () {
            this.get('controller').send('loadAllTags');
        },
    
        willDestroyElement: function () {
            this.get('controller').send('reset');
        },
    
        overlayStyles: Ember.computed('hasFocus', 'controller.suggestions.length', function () {
            var styles = [],
                leftPos;
    
            if (this.get('hasFocus') && this.get('controller.suggestions.length')) {
                leftPos = this.$().find('#tags').position().left;
                styles.push('display: block');
                styles.push('left: ' + leftPos + 'px');
            } else {
                styles.push('display: none');
                styles.push('left', 0);
            }
    
            return styles.join(';');
        }),
    
        tagInputView: Ember.TextField.extend({
            focusIn: function () {
                this.get('parentView').set('hasFocus', true);
            },
    
            focusOut: function () {
                this.get('parentView').set('hasFocus', false);
            },
    
            keyPress: function (event) {
                // listen to keypress event to handle comma key on international keyboard
                var controller = this.get('parentView.controller'),
                    isComma = ','.localeCompare(String.fromCharCode(event.keyCode || event.charCode)) === 0;
    
                // use localeCompare in case of international keyboard layout
                if (isComma) {
                    event.preventDefault();
    
                    if (controller.get('selectedSuggestion')) {
                        controller.send('addSelectedSuggestion');
                    } else {
                        controller.send('addNewTag');
                    }
                }
            },
    
            keyDown: function (event) {
                var controller = this.get('parentView.controller'),
                    keys = this.get('parentView.keys'),
                    hasValue;
    
                switch (event.keyCode) {
                    case keys.UP:
                        event.preventDefault();
                        controller.send('selectPreviousSuggestion');
                        break;
    
                    case keys.DOWN:
                        event.preventDefault();
                        controller.send('selectNextSuggestion');
                        break;
    
                    case keys.TAB:
                    case keys.ENTER:
                    case keys.NUMPAD_ENTER:
                        if (controller.get('selectedSuggestion')) {
                            event.preventDefault();
                            controller.send('addSelectedSuggestion');
                        } else {
                            // allow user to tab out of field if input is empty
                            hasValue = !Ember.isEmpty(this.get('value'));
                            if (hasValue || event.keyCode !== keys.TAB) {
                                event.preventDefault();
                                controller.send('addNewTag');
                            }
                        }
                        break;
    
                    case keys.BACKSPACE:
                        if (Ember.isEmpty(this.get('value'))) {
                            event.preventDefault();
                            controller.send('deleteLastTag');
                        }
                        break;
    
                    case keys.ESCAPE:
                        event.preventDefault();
                        controller.send('reset');
                        break;
                }
            }
        }),
    
        suggestionView: Ember.View.extend({
            tagName: 'li',
            classNameBindings: 'suggestion.selected',
    
            suggestion: null,
    
            // we can't use the 'click' event here as the focusOut event on the
            // input will fire first
    
            mouseDown: function (event) {
                event.preventDefault();
            },
    
            mouseUp: function (event) {
                event.preventDefault();
                this.get('parentView.controller').send('addTag',
                    this.get('suggestion.tag'));
            }
        }),
    
        actions: {
            deleteTag: function (tag) {
                // The view wants to keep focus on the input after a click on a tag
                Ember.$('.js-tag-input').focus();
                // Make the controller do the actual work
                this.get('controller').send('deleteTag', tag);
            }
        }
    });
    
    __exports__["default"] = PostTagsInputView;
  });
define("ghost/views/posts", 
  ["ghost/views/mobile/parent-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileParentView = __dependency1__["default"];

    
    var PostsView = MobileParentView.extend({
        classNames: ['content-view-container'],
        tagName: 'section',
    
        // Mobile parent view callbacks
        showMenu: function () {
            $('.js-content-list, .js-content-preview').addClass('show-menu').removeClass('show-content');
        },
        showContent: function () {
            $('.js-content-list, .js-content-preview').addClass('show-content').removeClass('show-menu');
        },
        showAll: function () {
            $('.js-content-list, .js-content-preview').removeClass('show-menu show-content');
        }
    });
    
    __exports__["default"] = PostsView;
  });
define("ghost/views/posts/index", 
  ["ghost/views/mobile/index-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileIndexView = __dependency1__["default"];

    
    var PostsIndexView = MobileIndexView.extend({
        classNames: ['no-posts-box']
    });
    
    __exports__["default"] = PostsIndexView;
  });
define("ghost/views/posts/post", 
  ["ghost/views/mobile/content-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileContentView = __dependency1__["default"];

    
    var PostsPostView = MobileContentView.extend();
    
    __exports__["default"] = PostsPostView;
  });
define("ghost/views/settings", 
  ["ghost/views/mobile/parent-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileParentView = __dependency1__["default"];

    
    var SettingsView = MobileParentView.extend({
        // MobileParentView callbacks
        showMenu: function () {
            $('.js-settings-header-inner').css('display', 'none');
            $('.js-settings-menu').css({right: '0', left: '0', 'margin-right': '0'});
            $('.js-settings-content').css({right: '-100%', left: '100%', 'margin-left': '15'});
        },
        showContent: function () {
            $('.js-settings-menu').css({right: '100%', left: '-110%', 'margin-right': '15px'});
            $('.js-settings-content').css({right: '0', left: '0', 'margin-left': '0'});
            $('.js-settings-header-inner').css('display', 'block');
        },
        showAll: function () {
            $('.js-settings-menu, .js-settings-content').removeAttr('style');
        }
    });
    
    __exports__["default"] = SettingsView;
  });
define("ghost/views/settings/about", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsAboutView = BaseView.extend();
    
    __exports__["default"] = SettingsAboutView;
  });
define("ghost/views/settings/apps", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsAppsView = BaseView.extend();
    
    __exports__["default"] = SettingsAppsView;
  });
define("ghost/views/settings/code-injection", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsGeneralView = BaseView.extend();
    
    __exports__["default"] = SettingsGeneralView;
  });
define("ghost/views/settings/content-base", 
  ["ghost/views/mobile/content-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileContentView = __dependency1__["default"];

    /**
     * All settings views other than the index should inherit from this base class.
     * It ensures that the correct screen is showing when a mobile user navigates
     * to a `settings.someRouteThatIsntIndex` route.
     */
    
    var SettingsContentBaseView = MobileContentView.extend({
        tagName: 'section',
        classNames: ['settings-content', 'js-settings-content', 'fade-in']
    });
    
    __exports__["default"] = SettingsContentBaseView;
  });
define("ghost/views/settings/general", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsGeneralView = BaseView.extend();
    
    __exports__["default"] = SettingsGeneralView;
  });
define("ghost/views/settings/index", 
  ["ghost/views/mobile/index-view","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var MobileIndexView = __dependency1__["default"];

    
    var SettingsIndexView = MobileIndexView.extend();
    
    __exports__["default"] = SettingsIndexView;
  });
define("ghost/views/settings/labs", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsLabsView = BaseView.extend();
    
    __exports__["default"] = SettingsLabsView;
  });
define("ghost/views/settings/tags", 
  ["ghost/views/settings/content-base","ghost/mixins/pagination-view-infinite-scroll","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    var PaginationScrollMixin = __dependency2__["default"];

    
    var SettingsTagsView = BaseView.extend(PaginationScrollMixin);
    
    __exports__["default"] = SettingsTagsView;
  });
define("ghost/views/settings/tags/settings-menu", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var TagsSettingsMenuView = Ember.View.extend({
        saveText: Ember.computed('controller.model.isNew', function () {
            return this.get('controller.model.isNew') ?
                'Add Tag' :
                'Save Tag';
        }),
    
        // This observer loads and resets the uploader whenever the active tag changes,
        // ensuring that we can reuse the whole settings menu.
        updateUploader: Ember.observer('controller.activeTag.image', 'controller.uploaderReference', function () {
            var uploader = this.get('controller.uploaderReference'),
                image = this.get('controller.activeTag.image');
    
            if (uploader && uploader[0]) {
                if (image) {
                    uploader[0].uploaderUi.initWithImage();
                } else {
                    uploader[0].uploaderUi.initWithDropzone();
                }
            }
        })
    });
    
    __exports__["default"] = TagsSettingsMenuView;
  });
define("ghost/views/settings/users", 
  ["ghost/views/settings/content-base","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var BaseView = __dependency1__["default"];

    
    var SettingsUsersView = BaseView.extend();
    
    __exports__["default"] = SettingsUsersView;
  });
define("ghost/views/settings/users/user", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var SettingsUserView = Ember.View.extend({
        currentUser: Ember.computed.alias('controller.session.user'),
    
        isNotOwnProfile: Ember.computed('controller.user.id', 'currentUser.id', function () {
            return this.get('controller.user.id') !== this.get('currentUser.id');
        }),
    
        isNotOwnersProfile: Ember.computed.not('controller.user.isOwner'),
    
        canAssignRoles: Ember.computed.or('currentUser.isAdmin', 'currentUser.isOwner'),
    
        canMakeOwner: Ember.computed.and('currentUser.isOwner', 'isNotOwnProfile', 'controller.user.isAdmin'),
    
        rolesDropdownIsVisible: Ember.computed.and('isNotOwnProfile', 'canAssignRoles', 'isNotOwnersProfile'),
    
        deleteUserActionIsVisible: Ember.computed('currentUser', 'canAssignRoles', 'controller.user', function () {
            if ((this.get('canAssignRoles') && this.get('isNotOwnProfile') && !this.get('controller.user.isOwner')) ||
                (this.get('currentUser.isEditor') && (this.get('isNotOwnProfile') ||
                this.get('controller.user.isAuthor')))) {
                return true;
            }
        }),
    
        userActionsAreVisible: Ember.computed.or('deleteUserActionIsVisible', 'canMakeOwner')
    
    });
    
    __exports__["default"] = SettingsUserView;
  });
define("ghost/views/settings/users/users-list-view", 
  ["ghost/mixins/pagination-view-infinite-scroll","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var PaginationViewMixin = __dependency1__["default"];

    
    var UsersListView = Ember.View.extend(PaginationViewMixin, {
        classNames: ['settings-users']
    });
    
    __exports__["default"] = UsersListView;
  });
define('ghost/templates/-contributors', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push("<li>\n    <a href=\"https://github.com/jaswilli\" title=\"jaswilli\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/jaswilli\" alt=\"jaswilli\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/PaulAdamDavis\" title=\"PaulAdamDavis\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/PaulAdamDavis\" alt=\"PaulAdamDavis\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/ErisDS\" title=\"ErisDS\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/ErisDS\" alt=\"ErisDS\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/cobbspur\" title=\"cobbspur\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/cobbspur\" alt=\"cobbspur\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/felixrieseberg\" title=\"felixrieseberg\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/felixrieseberg\" alt=\"felixrieseberg\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/novaugust\" title=\"novaugust\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/novaugust\" alt=\"novaugust\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/JohnONolan\" title=\"JohnONolan\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/JohnONolan\" alt=\"JohnONolan\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/rwjblue\" title=\"rwjblue\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/rwjblue\" alt=\"rwjblue\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/Gargol\" title=\"Gargol\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/Gargol\" alt=\"Gargol\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/sebgie\" title=\"sebgie\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/sebgie\" alt=\"sebgie\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/jgable\" title=\"jgable\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/jgable\" alt=\"jgable\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/dbalders\" title=\"dbalders\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/dbalders\" alt=\"dbalders\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/jillesme\" title=\"jillesme\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/jillesme\" alt=\"jillesme\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/javorszky\" title=\"javorszky\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/javorszky\" alt=\"javorszky\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/mattiascibien\" title=\"mattiascibien\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/mattiascibien\" alt=\"mattiascibien\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/RaoHai\" title=\"RaoHai\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/RaoHai\" alt=\"RaoHai\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/halfdan\" title=\"halfdan\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/halfdan\" alt=\"halfdan\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/matthojo\" title=\"matthojo\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/matthojo\" alt=\"matthojo\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/hswolff\" title=\"hswolff\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/hswolff\" alt=\"hswolff\">\n    </a>\n</li>\n<li>\n    <a href=\"https://github.com/tgriesser\" title=\"tgriesser\">\n        <img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/contributors", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/contributors", options))));
  data.buffer.push("/tgriesser\" alt=\"tgriesser\">\n    </a>\n</li>");
  return buffer;
  
}); });

define('ghost/templates/-import-errors', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n<table class=\"table\">\r\n");
  stack1 = helpers.each.call(depth0, "error", "in", "importErrors", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</table>\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n    <tr><td>");
  stack1 = helpers._triageMustache.call(depth0, "error.message", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</td></tr>\r\n");
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, "importErrors", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/-navbar', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n        <div class=\"nav-label\"><i class=\"icon-content\"></i> Content</div>\r\n    ");
  }

function program3(depth0,data) {
  
  
  data.buffer.push("\r\n        <div class=\"nav-label\"><i class=\"icon-add\"></i> New Post</div>\r\n    ");
  }

function program5(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'classNames': ("nav-item nav-settings js-nav-item")
  },hashTypes:{'classNames': "STRING"},hashContexts:{'classNames': depth0},inverse:self.noop,fn:self.program(6, program6, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    ");
  return buffer;
  }
function program6(depth0,data) {
  
  
  data.buffer.push("\r\n        <div class=\"nav-label\"><i class=\"icon-settings2\"></i> Settings</div>\r\n    ");
  }

function program8(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n            ");
  stack1 = helpers['if'].call(depth0, "session.user.image", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(11, program11, data),fn:self.program(9, program9, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            <div class=\"name\">\r\n                ");
  stack1 = helpers._triageMustache.call(depth0, "session.user.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(" <i class=\"icon-chevron-down\"></i>\r\n                <small>Profile &amp; Settings</small>\r\n            </div>\r\n        ");
  return buffer;
  }
function program9(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n            <div class=\"image\"><img ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'src': ("session.user.image"),
    'alt': ("userImageAlt")
  },hashTypes:{'src': "ID",'alt': "ID"},hashContexts:{'src': depth0,'alt': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" /></div>\r\n            ");
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n            <div class=\"image\"><img src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "blog", "shared/img/user-image.png", options) : helperMissing.call(depth0, "gh-path", "blog", "shared/img/user-image.png", options))));
  data.buffer.push("\" alt=\"Profile picture\" /></div>\r\n            ");
  return buffer;
  }

function program13(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n            <ul class=\"dropdown-menu dropdown-triangle-top-right js-user-menu-dropdown-menu\" role=\"menu\">\r\n                <li role=\"presentation\">");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'classNames': ("dropdown-item user-menu-profile js-nav-item"),
    'role': ("menuitem"),
    'tabindex': ("-1")
  },hashTypes:{'classNames': "STRING",'role': "STRING",'tabindex': "STRING"},hashContexts:{'classNames': depth0,'role': depth0,'tabindex': depth0},inverse:self.noop,fn:self.program(14, program14, data),contexts:[depth0,depth0],types:["STRING","ID"],data:data},helper ? helper.call(depth0, "settings.users.user", "session.user.slug", options) : helperMissing.call(depth0, "link-to", "settings.users.user", "session.user.slug", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</li>\r\n                <li role=\"presentation\"><a class=\"dropdown-item user-menu-support\" role=\"menuitem\" tabindex=\"-1\" href=\"http://support.ghost.org/\"><i class=\"icon-support\"></i> Help / Support</a></li>\r\n                <li class=\"divider\"></li>\r\n                <li role=\"presentation\">");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'classNames': ("dropdown-item user-menu-signout"),
    'role': ("menuitem"),
    'tabindex': ("-1")
  },hashTypes:{'classNames': "STRING",'role': "STRING",'tabindex': "STRING"},hashContexts:{'classNames': depth0,'role': depth0,'tabindex': depth0},inverse:self.noop,fn:self.program(16, program16, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "signout", options) : helperMissing.call(depth0, "link-to", "signout", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</li>\r\n            </ul>\r\n        ");
  return buffer;
  }
function program14(depth0,data) {
  
  
  data.buffer.push("<i class=\"icon-user\"></i> Your Profile");
  }

function program16(depth0,data) {
  
  
  data.buffer.push("<i class=\"icon-power\"></i> Sign Out");
  }

  data.buffer.push("<nav class=\"global-nav\" role=\"navigation\">\r\n\r\n    <a class=\"nav-item ghost-logo\" href=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "blog", options) : helperMissing.call(depth0, "gh-path", "blog", options))));
  data.buffer.push("\" title=\"Visit blog\">\r\n        <div class=\"nav-label\"><i class=\"icon-ghost\"></i> <span>Visit blog</span> </div>\r\n    </a>\r\n\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'classNames': ("nav-item nav-content js-nav-item")
  },hashTypes:{'classNames': "STRING"},hashContexts:{'classNames': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "posts", options) : helperMissing.call(depth0, "link-to", "posts", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'classNames': ("nav-item nav-new js-nav-item")
  },hashTypes:{'classNames': "STRING"},hashContexts:{'classNames': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "editor.new", options) : helperMissing.call(depth0, "link-to", "editor.new", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n    ");
  stack1 = helpers.unless.call(depth0, "session.user.isAuthor", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n    \r\n\r\n    <div class=\"nav-item user-menu\">\r\n        ");
  stack1 = (helper = helpers['gh-dropdown-button'] || (depth0 && depth0['gh-dropdown-button']),options={hash:{
    'dropdownName': ("user-menu"),
    'tagName': ("div"),
    'classNames': ("nav-label clearfix")
  },hashTypes:{'dropdownName': "STRING",'tagName': "STRING",'classNames': "STRING"},hashContexts:{'dropdownName': depth0,'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(8, program8, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown-button", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        ");
  stack1 = (helper = helpers['gh-dropdown'] || (depth0 && depth0['gh-dropdown']),options={hash:{
    'tagName': ("div"),
    'classNames': ("dropdown"),
    'name': ("user-menu"),
    'closeOnClick': ("true")
  },hashTypes:{'tagName': "STRING",'classNames': "STRING",'name': "STRING",'closeOnClick': "STRING"},hashContexts:{'tagName': depth0,'classNames': depth0,'name': depth0,'closeOnClick': depth0},inverse:self.noop,fn:self.program(13, program13, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n\r\n</nav>\r\n\r\n<div class=\"nav-cover js-nav-cover\"></div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/-publish-bar', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push("<footer id=\"publish-bar\">\r\n    <div class=\"publish-bar-inner\">\r\n        ");
  data.buffer.push(escapeExpression((helper = helpers.render || (depth0 && depth0.render),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "post-tags-input", options) : helperMissing.call(depth0, "render", "post-tags-input", options))));
  data.buffer.push("\r\n\r\n        <div class=\"publish-bar-actions\">\r\n            <button type=\"button\" class=\"post-settings\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleSettingsMenu", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("></button>\r\n            ");
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "editor-save-button", {hash:{
    'id': ("entry-actions"),
    'classNameBindings': ("isNew:unsaved")
  },hashTypes:{'id': "STRING",'classNameBindings': "STRING"},hashContexts:{'id': depth0,'classNameBindings': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("\r\n        </div>\r\n    </div>\r\n</footer>\r\n");
  return buffer;
  
}); });

define('ghost/templates/-user-actions-menu', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n<li><button ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "transfer-owner", "", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0],types:["STRING","STRING","ID"],data:data})));
  data.buffer.push(">Make Owner</button></li>\r\n");
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n<li><button ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "delete-user", "", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0],types:["STRING","STRING","ID"],data:data})));
  data.buffer.push(" class=\"delete\">Delete User</button></li>\r\n");
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, "view.canMakeOwner", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  stack1 = helpers['if'].call(depth0, "view.deleteUserActionIsVisible", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  return buffer;
  
}); });

define('ghost/templates/application', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "navbar", options) : helperMissing.call(depth0, "partial", "navbar", options))));
  data.buffer.push("\r\n");
  return buffer;
  }

  data.buffer.push("<a class=\"sr-only sr-only-focusable\" href=\"#gh-main\">Skip to main content</a>\r\n\r\n");
  stack1 = helpers.unless.call(depth0, "hideNav", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n<main id=\"gh-main\" class=\"viewport\" role=\"main\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'data-notification-count': ("topNotificationCount")
  },hashTypes:{'data-notification-count': "ID"},hashContexts:{'data-notification-count': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-notifications'] || (depth0 && depth0['gh-notifications']),options={hash:{
    'location': ("top"),
    'notify': ("topNotificationChange")
  },hashTypes:{'location': "STRING",'notify': "STRING"},hashContexts:{'location': depth0,'notify': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-notifications", options))));
  data.buffer.push("\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-notifications'] || (depth0 && depth0['gh-notifications']),options={hash:{
    'location': ("bottom")
  },hashTypes:{'location': "STRING"},hashContexts:{'location': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-notifications", options))));
  data.buffer.push("\r\n    ");
  stack1 = helpers._triageMustache.call(depth0, "outlet", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</main>\r\n\r\n");
  data.buffer.push(escapeExpression((helper = helpers.outlet || (depth0 && depth0.outlet),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "modal", options) : helperMissing.call(depth0, "outlet", "modal", options))));
  data.buffer.push("\r\n\r\n");
  data.buffer.push(escapeExpression((helper = helpers.outlet || (depth0 && depth0.outlet),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings-menu", options) : helperMissing.call(depth0, "outlet", "settings-menu", options))));
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-activating-list-item', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  stack1 = helpers._triageMustache.call(depth0, "title", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  stack1 = helpers._triageMustache.call(depth0, "yield", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  return buffer;
  }

  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'alternateActive': ("active")
  },hashTypes:{'alternateActive': "ID"},hashContexts:{'alternateActive': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "route", options) : helperMissing.call(depth0, "link-to", "route", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-file-upload', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression;


  data.buffer.push("    <input data-url=\"upload\" class=\"btn btn-green\" type=\"file\" name=\"importfile\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'accept': ("options.acceptEncoding")
  },hashTypes:{'accept': "ID"},hashContexts:{'accept': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n    <button type=\"submit\" class=\"btn btn-blue\" id=\"startupload\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("uploadButtonDisabled")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "upload", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n        ");
  stack1 = helpers._triageMustache.call(depth0, "uploadButtonText", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </button>\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-markdown', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push(escapeExpression((helper = helpers['gh-format-markdown'] || (depth0 && depth0['gh-format-markdown']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "markdown", options) : helperMissing.call(depth0, "gh-format-markdown", "markdown", options))));
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-modal-dialog', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("<header class=\"modal-header\"><h1>");
  stack1 = helpers._triageMustache.call(depth0, "title", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h1></header>");
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = '';
  data.buffer.push("<a class=\"close\" href=\"\" title=\"Close\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeModal", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"hidden\">Close</span></a>");
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n            <footer class=\"modal-footer\">\r\n                <button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("rejectButtonClass :js-button-reject")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "confirm", "reject", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(">\r\n                    ");
  stack1 = helpers._triageMustache.call(depth0, "confirm.reject.text", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </button>\r\n                <button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("acceptButtonClass :js-button-accept")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "confirm", "accept", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(">\r\n                    ");
  stack1 = helpers._triageMustache.call(depth0, "confirm.accept.text", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </button>\r\n            </footer>\r\n            ");
  return buffer;
  }

  data.buffer.push("<div class=\"modal-container js-modal-container\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeModal", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n    <article ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("klass :js-modal")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <section class=\"modal-content\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, {hash:{
    'bubbles': (false),
    'preventDefault': (false)
  },hashTypes:{'bubbles': "BOOLEAN",'preventDefault': "BOOLEAN"},hashContexts:{'bubbles': depth0,'preventDefault': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n            ");
  stack1 = helpers['if'].call(depth0, "title", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            ");
  stack1 = helpers['if'].call(depth0, "showClose", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            <section class=\"modal-body\">\r\n                ");
  stack1 = helpers._triageMustache.call(depth0, "yield", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            </section>\r\n            ");
  stack1 = helpers['if'].call(depth0, "confirm", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </section>\r\n    </article>\r\n</div>\r\n<div class=\"modal-background fade js-modal-background\"></div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-notification', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', escapeExpression=this.escapeExpression;


  data.buffer.push("<section ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":js-notification typeClass")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n    <span class=\"notification-message\">\r\n        ");
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "message.message", {hash:{
    'unescaped': ("true")
  },hashTypes:{'unescaped': "STRING"},hashContexts:{'unescaped': depth0},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("\r\n    </span>\r\n    <button class=\"close\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeNotification", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"hidden\">Close</span></button>\r\n</section>");
  return buffer;
  
}); });

define('ghost/templates/components/gh-notifications', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-notification'] || (depth0 && depth0['gh-notification']),options={hash:{
    'message': ("message")
  },hashTypes:{'message': "ID"},hashContexts:{'message': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-notification", options))));
  data.buffer.push("\r\n");
  return buffer;
  }

  stack1 = helpers.each.call(depth0, "message", "in", "messages", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-role-selector', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n<option ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'value': ("role.id")
  },hashTypes:{'value': "ID"},hashContexts:{'value': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">");
  stack1 = helpers._triageMustache.call(depth0, "role.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</option>\r\n");
  return buffer;
  }

  data.buffer.push("<select ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'id': ("selectId"),
    'name': ("selectName")
  },hashTypes:{'id': "ID",'name': "ID"},hashContexts:{'id': depth0,'name': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n");
  stack1 = helpers.each.call(depth0, "role", "in", "roles", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</select>\r\n");
  return buffer;
  
}); });

define('ghost/templates/components/gh-uploader', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression;


  data.buffer.push("<span class=\"media\">\r\n    <span class=\"hidden\">Image Upload</span>\r\n</span>\r\n<img class=\"js-upload-target\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'src': ("image")
  },hashTypes:{'src': "ID"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n<div class=\"description\">");
  stack1 = helpers._triageMustache.call(depth0, "description", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("<strong></strong></div>\r\n<input data-url=\"upload\" class=\"js-fileupload main fileupload\" type=\"file\" name=\"uploadimage\">");
  return buffer;
  
}); });

define('ghost/templates/editor-save-button', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n    <i class=\"options\"></i>\r\n    <span class=\"sr-only\">Toggle Settings Menu</span>\r\n");
  }

function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n    <ul class=\"dropdown-menu dropdown-triangle-bottom-right\">\r\n        <li class=\"post-save-publish\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("willPublish:active")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n            <a ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "setSaveType", "publish", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(" href=\"#\">");
  stack1 = helpers._triageMustache.call(depth0, "view.publishText", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</a>\r\n        </li>\r\n        <li class=\"post-save-draft\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("willPublish::active")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n            <a ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "setSaveType", "draft", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(" href=\"#\">");
  stack1 = helpers._triageMustache.call(depth0, "view.draftText", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</a>\r\n        </li>\r\n        <li class=\"divider delete\"></li>\r\n        <li class=\"delete\">\r\n            <a ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "delete-post", "", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0],types:["STRING","STRING","ID"],data:data})));
  data.buffer.push(" href=\"#\">Delete Post</a>\r\n        </li>\r\n    </ul>\r\n");
  return buffer;
  }

  data.buffer.push("<button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "save", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":btn :btn-sm view.isDangerous:btn-red:btn-blue :js-publish-button")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">");
  stack1 = helpers._triageMustache.call(depth0, "view.saveText", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</button>\r\n");
  stack1 = (helper = helpers['gh-dropdown-button'] || (depth0 && depth0['gh-dropdown-button']),options={hash:{
    'dropdownName': ("post-save-menu"),
    'classNameBindings': (":btn :btn-sm view.isDangerous:btn-red:btn-blue btnopen:active :dropdown-toggle :up")
  },hashTypes:{'dropdownName': "STRING",'classNameBindings': "STRING"},hashContexts:{'dropdownName': depth0,'classNameBindings': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown-button", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  stack1 = (helper = helpers['gh-dropdown'] || (depth0 && depth0['gh-dropdown']),options={hash:{
    'name': ("post-save-menu"),
    'closeOnClick': ("true"),
    'tagName': ("div"),
    'classNames': ("dropdown editor-options")
  },hashTypes:{'name': "STRING",'closeOnClick': "STRING",'tagName': "STRING",'classNames': "STRING"},hashContexts:{'name': depth0,'closeOnClick': depth0,'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  return buffer;
  
}); });

define('ghost/templates/editor/edit', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  data.buffer.push("<header class=\"page-header\">\r\n    <button class=\"menu-button js-menu-button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleGlobalMobileNav", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"sr-only\">Menu</span></button>\r\n    <h2 class=\"page-title\">Editor</h2>\r\n</header>\r\n\r\n<div class=\"page-content\">\r\n    <header>\r\n        <section class=\"box entry-title\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-trim-focus-input'] || (depth0 && depth0['gh-trim-focus-input']),options={hash:{
    'type': ("text"),
    'id': ("entry-title"),
    'placeholder': ("Your Post Title"),
    'value': ("titleScratch"),
    'tabindex': ("1"),
    'focus': ("shouldFocusTitle")
  },hashTypes:{'type': "STRING",'id': "STRING",'placeholder': "STRING",'value': "ID",'tabindex': "STRING",'focus': "ID"},hashContexts:{'type': depth0,'id': depth0,'placeholder': depth0,'value': depth0,'tabindex': depth0,'focus': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-trim-focus-input", options))));
  data.buffer.push("\r\n        </section>\r\n    </header>\r\n\r\n    <section ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":entry-markdown :js-entry-markdown isPreview::active")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <header ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "togglePreview", false, {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","BOOLEAN"],data:data})));
  data.buffer.push(" class=\"floatingheader\">\r\n            <small>Markdown</small>\r\n            <a class=\"markdown-help\" href=\"\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "markdown", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push("><span class=\"hidden\">What is Markdown?</span></a>\r\n        </header>\r\n        <section id=\"entry-markdown-content\" class=\"entry-markdown-content\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-codemirror'] || (depth0 && depth0['gh-codemirror']),options={hash:{
    'value': ("scratch"),
    'scrollInfo': ("view.markdownScrollInfo"),
    'setCodeMirror': ("setCodeMirror"),
    'openModal': ("openModal"),
    'typingPause': ("autoSave"),
    'focus': ("shouldFocusEditor"),
    'focusCursorAtEnd': ("model.isDirty"),
    'onFocusIn': ("autoSaveNew")
  },hashTypes:{'value': "ID",'scrollInfo': "ID",'setCodeMirror': "STRING",'openModal': "STRING",'typingPause': "STRING",'focus': "ID",'focusCursorAtEnd': "ID",'onFocusIn': "STRING"},hashContexts:{'value': depth0,'scrollInfo': depth0,'setCodeMirror': depth0,'openModal': depth0,'typingPause': depth0,'focus': depth0,'focusCursorAtEnd': depth0,'onFocusIn': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-codemirror", options))));
  data.buffer.push("\r\n        </section>\r\n    </section>\r\n\r\n    <section ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":entry-preview :js-entry-preview isPreview:active")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <header ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "togglePreview", true, {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","BOOLEAN"],data:data})));
  data.buffer.push(" class=\"floatingheader\">\r\n            <small>Preview <span class=\"entry-word-count js-entry-word-count\">");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-words'] || (depth0 && depth0['gh-count-words']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "scratch", options) : helperMissing.call(depth0, "gh-count-words", "scratch", options))));
  data.buffer.push("</span></small>\r\n        </header>\r\n        <section class=\"entry-preview-content js-entry-preview-content\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-markdown'] || (depth0 && depth0['gh-markdown']),options={hash:{
    'classNames': ("rendered-markdown js-rendered-markdown"),
    'markdown': ("scratch"),
    'scrollPosition': ("view.scrollPosition"),
    'uploadStarted': ("disableCodeMirror"),
    'uploadFinished': ("enableCodeMirror"),
    'uploadSuccess': ("handleImgUpload")
  },hashTypes:{'classNames': "STRING",'markdown': "ID",'scrollPosition': "ID",'uploadStarted': "STRING",'uploadFinished': "STRING",'uploadSuccess': "STRING"},hashContexts:{'classNames': depth0,'markdown': depth0,'scrollPosition': depth0,'uploadStarted': depth0,'uploadFinished': depth0,'uploadSuccess': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-markdown", options))));
  data.buffer.push("\r\n        </section>\r\n    </section>\r\n\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "publish-bar", options) : helperMissing.call(depth0, "partial", "publish-bar", options))));
  data.buffer.push("\r\n\r\n</div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/error', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n    <section class=\"error-stack\">\r\n        <h3>Stack Trace</h3>\r\n        <p><strong>");
  stack1 = helpers._triageMustache.call(depth0, "message", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</strong></p>\r\n        <ul class=\"error-stack-list\">\r\n            ");
  stack1 = helpers.each.call(depth0, "item", "in", "stack", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </ul>\r\n    </section>\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                <li>\r\n                    at\r\n                    ");
  stack1 = helpers['if'].call(depth0, "item.function", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                    <span class=\"error-stack-file\">(");
  stack1 = helpers._triageMustache.call(depth0, "item.at", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(")</span>\r\n                </li>\r\n            ");
  return buffer;
  }
function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("<em class=\"error-stack-function\">");
  stack1 = helpers._triageMustache.call(depth0, "item.function", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</em>");
  return buffer;
  }

  data.buffer.push("<section class=\"error-content error-404 js-error-container\">\r\n    <section class=\"error-details\">\r\n         <figure class=\"error-image\">\r\n             <img class=\"error-ghost\" src=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/404-ghost@2x.png", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/404-ghost@2x.png", options))));
  data.buffer.push("\" srcset=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/404-ghost.png", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/404-ghost.png", options))));
  data.buffer.push(" 1x, ");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data},helper ? helper.call(depth0, "admin", "/img/404-ghost@2x.png", options) : helperMissing.call(depth0, "gh-path", "admin", "/img/404-ghost@2x.png", options))));
  data.buffer.push(" 2x\" />\r\n         </figure>\r\n         <section class=\"error-message\">\r\n             <h1 class=\"error-code\">");
  stack1 = helpers._triageMustache.call(depth0, "code", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h1>\r\n             <h2 class=\"error-description\">");
  stack1 = helpers._triageMustache.call(depth0, "message", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h2>\r\n             <a class=\"error-link\" href=\"");
  data.buffer.push(escapeExpression((helper = helpers['gh-path'] || (depth0 && depth0['gh-path']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "blog", options) : helperMissing.call(depth0, "gh-path", "blog", options))));
  data.buffer.push("\">Go to the front page →</a>\r\n         </section>\r\n    </section>\r\n</section>\r\n\r\n");
  stack1 = helpers['if'].call(depth0, "stack", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/forgotten', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push("<section class=\"forgotten-box js-forgotten-box fade-in\">\r\n    <form id=\"forgotten\" class=\"forgotten-form\" method=\"post\" novalidate=\"novalidate\">\r\n        <div class=\"email-wrap\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-trim-focus-input'] || (depth0 && depth0['gh-trim-focus-input']),options={hash:{
    'value': ("email"),
    'class': ("email"),
    'type': ("email"),
    'placeholder': ("Email Address"),
    'name': ("email"),
    'autofocus': ("autofocus"),
    'autocapitalize': ("off"),
    'autocorrect': ("off")
  },hashTypes:{'value': "ID",'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'autofocus': "STRING",'autocapitalize': "STRING",'autocorrect': "STRING"},hashContexts:{'value': depth0,'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'autofocus': depth0,'autocapitalize': depth0,'autocorrect': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-trim-focus-input", options))));
  data.buffer.push("\r\n        </div>\r\n        <button class=\"btn btn-blue\" type=\"submit\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "submit", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitting")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Send new password</button>\r\n    </form>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/copy-html', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n\r\n    ");
  data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{
    'value': ("generatedHTML"),
    'rows': ("6")
  },hashTypes:{'value': "ID",'rows': "STRING"},hashContexts:{'value': depth0,'rows': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "textarea", options))));
  data.buffer.push("\r\n\r\n");
  return buffer;
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'animation': ("fade"),
    'title': ("Generated HTML"),
    'confirm': ("confirm"),
    'class': ("copy-html")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID",'class': "STRING"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'animation': depth0,'title': depth0,'confirm': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/delete-all', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n\r\n    <p>This is permanent! No backups, no restores, no magic undo button. <br /> We warned you, ok?</p>\r\n\r\n");
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'type': ("action"),
    'style': ("wide,centered"),
    'animation': ("fade"),
    'title': ("Would you really like to delete all content from your blog?"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/delete-post', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n\r\n    <p>You're about to delete \"<strong>");
  stack1 = helpers._triageMustache.call(depth0, "model.title", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</strong>\".<br />This is permanent! No backups, no restores, no magic undo button. <br /> We warned you, ok?</p>\r\n\r\n");
  return buffer;
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'style': ("wide,centered"),
    'animation': ("fade"),
    'title': ("Are you sure you want to delete this post?"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/delete-user', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n\r\n    ");
  stack1 = helpers.unless.call(depth0, "userPostCount.isPending", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n        ");
  stack1 = helpers['if'].call(depth0, "userPostCount.count", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    ");
  return buffer;
  }
function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n            <strong>WARNING:</strong> <span class=\"red\">This user is the author of ");
  stack1 = helpers._triageMustache.call(depth0, "userPostCount.count", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(" ");
  stack1 = helpers._triageMustache.call(depth0, "userPostCount.inflection", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(".</span> All posts and user data will be deleted. There is no way to recover this.\r\n        ");
  return buffer;
  }

function program5(depth0,data) {
  
  
  data.buffer.push("\r\n            <strong>WARNING:</strong> All user data will be deleted. There is no way to recover this.\r\n        ");
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'style': ("wide,centered"),
    'animation': ("fade"),
    'title': ("Are you sure you want to delete this user?"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/invite-new-user', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label for=\"new-user-email\">Email Address</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'action': ("confirmAccept"),
    'class': ("email"),
    'id': ("new-user-email"),
    'type': ("email"),
    'placeholder': ("Email Address"),
    'name': ("email"),
    'autofocus': ("autofocus"),
    'autocapitalize': ("off"),
    'autocorrect': ("off"),
    'value': ("email")
  },hashTypes:{'action': "STRING",'class': "STRING",'id': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'autofocus': "STRING",'autocapitalize': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'action': depth0,'class': depth0,'id': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'autofocus': depth0,'autocapitalize': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </div>\r\n\r\n            <div class=\"form-group for-select\">\r\n                <label for=\"new-user-role\">Role</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-role-selector'] || (depth0 && depth0['gh-role-selector']),options={hash:{
    'initialValue': ("authorRole"),
    'onChange': ("setRole"),
    'selectId': ("new-user-role")
  },hashTypes:{'initialValue': "ID",'onChange': "STRING",'selectId': "STRING"},hashContexts:{'initialValue': depth0,'onChange': depth0,'selectId': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-role-selector", options))));
  data.buffer.push("\r\n            </div>\r\n\r\n        </fieldset>\r\n\r\n");
  return buffer;
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'animation': ("fade"),
    'title': ("Invite a New User"),
    'confirm': ("confirm"),
    'class': ("invite-new-user")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID",'class': "STRING"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'animation': depth0,'title': depth0,'confirm': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/leave-editor', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n\r\n    <p>Hey there! It looks like you're in the middle of writing something and you haven't saved all of your\r\n    content.</p>\r\n    \r\n    <p>Save before you go!</p>\r\n\r\n");
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'style': ("wide,centered"),
    'animation': ("fade"),
    'title': ("Are you sure you want to leave this page?"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/markdown', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n    <section class=\"markdown-help-container\">\r\n        <table class=\"modal-markdown-help-table\">\r\n            <thead>\r\n            <tr>\r\n                <th>Result</th>\r\n                <th>Markdown</th>\r\n                <th>Shortcut</th>\r\n            </tr>\r\n            </thead>\r\n            <tbody>\r\n            <tr>\r\n                <td><strong>Bold</strong></td>\r\n                <td>**text**</td>\r\n                <td>Ctrl/⌘ + B </td>\r\n            </tr>\r\n            <tr>\r\n                <td><em>Emphasize</em></td>\r\n                <td>*text*</td>\r\n                <td>Ctrl/⌘ + I</td>\r\n            </tr>\r\n            <tr>\r\n                <td><del>Strike-through</del></td>\r\n                <td>~~text~~</td>\r\n                <td>Ctrl + Alt + U</td>\r\n            </tr>\r\n            <tr>\r\n                <td><a href=\"#\">Link</a></td>\r\n                <td>[title](http://)</td>\r\n                <td>Ctrl/⌘ + K</td>\r\n            </tr>\r\n            <tr>\r\n                <td><code>Inline Code</code></td>\r\n                <td>`code`</td>\r\n                <td>Ctrl/⌘ + Shift + K</td>\r\n            </tr>\r\n            <tr>\r\n                <td>Image</td>\r\n                <td>![alt](http://)</td>\r\n                <td>Ctrl/⌘ + Shift + I</td>\r\n            </tr>\r\n            <tr>\r\n                <td>List</td>\r\n                <td>* item</td>\r\n                <td>Ctrl + L</td>\r\n            </tr>\r\n            <tr>\r\n                <td>Blockquote</td>\r\n                <td>> quote</td>\r\n                <td>Ctrl + Q</td>\r\n            </tr>\r\n            <tr>\r\n                <td><mark>Highlight</mark></td>\r\n                <td>==Highlight==</td>\r\n                <td></td>\r\n            </tr>\r\n            <tr>\r\n                <td>H1</td>\r\n                <td># Heading</td>\r\n                <td></td>\r\n            </tr>\r\n            <tr>\r\n                <td>H2</td>\r\n                <td>## Heading</td>\r\n                <td>Ctrl/⌘ + H</td>\r\n            </tr>\r\n            <tr>\r\n                <td>H3</td>\r\n                <td>### Heading</td>\r\n                <td>Ctrl/⌘ + H (x2)</td>\r\n            </tr>\r\n            </tbody>\r\n        </table>\r\n        For further Markdown syntax reference: <a href=\"http://daringfireball.net/projects/markdown/syntax\" target=\"_blank\">Markdown Documentation</a>\r\n    </section>\r\n");
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'style': ("wide"),
    'animation': ("fade"),
    'title': ("Markdown Help")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'style': "STRING",'animation': "STRING",'title': "STRING"},hashContexts:{'action': depth0,'showClose': depth0,'style': depth0,'animation': depth0,'title': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/signin', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n\r\n        <form id=\"login\" class=\"login-form\" method=\"post\" novalidate=\"novalidate\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "validateAndAuthenticate", {hash:{
    'on': ("submit")
  },hashTypes:{'on': "STRING"},hashContexts:{'on': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n            <div class=\"password-wrap\">\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'class': ("password"),
    'type': ("password"),
    'placeholder': ("Password"),
    'name': ("password"),
    'value': ("password")
  },hashTypes:{'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'value': "ID"},hashContexts:{'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </div>\r\n            <button class=\"btn btn-blue\" type=\"submit\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "validateAndAuthenticate", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitting")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Log in</button>\r\n       </form>\r\n\r\n");
  return buffer;
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'style': ("wide"),
    'animation': ("fade"),
    'title': ("Please re-authenticate"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/transfer-owner', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("\r\n\r\n    <p>Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.</p>\r\n\r\n");
  }

  stack1 = (helper = helpers['gh-modal-dialog'] || (depth0 && depth0['gh-modal-dialog']),options={hash:{
    'action': ("closeModal"),
    'showClose': (true),
    'type': ("action"),
    'style': ("wide,centered"),
    'animation': ("fade"),
    'title': ("Transfer Ownership"),
    'confirm': ("confirm")
  },hashTypes:{'action': "STRING",'showClose': "BOOLEAN",'type': "STRING",'style': "STRING",'animation': "STRING",'title': "STRING",'confirm': "ID"},hashContexts:{'action': depth0,'showClose': depth0,'type': depth0,'style': depth0,'animation': depth0,'title': depth0,'confirm': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-modal-dialog", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/modals/upload', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n  <section class=\"js-drop-zone\">\r\n      <img class=\"js-upload-target\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'src': ("src")
  },hashTypes:{'src': "ID"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" alt=\"logo\">\r\n      <input data-url=\"upload\" class=\"js-fileupload main\" type=\"file\" name=\"uploadimage\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'accept': ("acceptEncoding")
  },hashTypes:{'accept': "ID"},hashContexts:{'accept': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" >\r\n  </section>\r\n\r\n");
  return buffer;
  }

  stack1 = (helper = helpers['gh-upload-modal'] || (depth0 && depth0['gh-upload-modal']),options={hash:{
    'action': ("closeModal"),
    'close': (true),
    'type': ("action"),
    'style': ("wide"),
    'model': ("model"),
    'imageType': ("imageType"),
    'animation': ("fade")
  },hashTypes:{'action': "STRING",'close': "BOOLEAN",'type': "STRING",'style': "STRING",'model': "ID",'imageType': "ID",'animation': "STRING"},hashContexts:{'action': depth0,'close': depth0,'type': depth0,'style': depth0,'model': depth0,'imageType': depth0,'animation': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-upload-modal", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/post-settings-menu', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this, functionType="function", blockHelperMissing=helpers.blockHelperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n<div id=\"entry-controls\">\r\n    <div ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("isViewingSubview:settings-menu-pane-out-left:settings-menu-pane-in :settings-menu :settings-menu-pane")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <div class=\"settings-menu-header\">\r\n            <h4>Post Settings</h4>\r\n            <button class=\"close icon-x settings-menu-header-action\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSettingsMenu", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"hidden\">Close</span></button>\r\n        </div>\r\n        <div class=\"settings-menu-content\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-uploader'] || (depth0 && depth0['gh-uploader']),options={hash:{
    'uploaded': ("setCoverImage"),
    'canceled': ("clearCoverImage"),
    'description': ("Add post image"),
    'image': ("image"),
    'uploaderReference': ("uploaderReference"),
    'tagName': ("section")
  },hashTypes:{'uploaded': "STRING",'canceled': "STRING",'description': "STRING",'image': "ID",'uploaderReference': "ID",'tagName': "STRING"},hashContexts:{'uploaded': depth0,'canceled': depth0,'description': depth0,'image': depth0,'uploaderReference': depth0,'tagName': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-uploader", options))));
  data.buffer.push("\r\n            <form>\r\n            <div class=\"form-group\">\r\n                <label for=\"url\">Post URL</label>\r\n                <span class=\"input-icon icon-link\">\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'class': ("post-setting-slug"),
    'id': ("url"),
    'value': ("slugValue"),
    'name': ("post-setting-slug"),
    'focus-out': ("updateSlug"),
    'selectOnClick': ("true"),
    'stopEnterKeyDownPropagation': ("true")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID",'name': "STRING",'focus-out': "STRING",'selectOnClick': "STRING",'stopEnterKeyDownPropagation': "STRING"},hashContexts:{'class': depth0,'id': depth0,'value': depth0,'name': depth0,'focus-out': depth0,'selectOnClick': depth0,'stopEnterKeyDownPropagation': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                </span>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"post-setting-date\">Publish Date</label>\r\n                <span class=\"input-icon icon-calendar\">\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'class': ("post-setting-date"),
    'id': ("post-setting-date"),
    'value': ("publishedAtValue"),
    'name': ("post-setting-date"),
    'focus-out': ("setPublishedAt"),
    'stopEnterKeyDownPropagation': ("true")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID",'name': "STRING",'focus-out': "STRING",'stopEnterKeyDownPropagation': "STRING"},hashContexts:{'class': depth0,'id': depth0,'value': depth0,'name': depth0,'focus-out': depth0,'stopEnterKeyDownPropagation': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                </span>\r\n            </div>\r\n\r\n            ");
  stack1 = helpers.unless.call(depth0, "session.user.isAuthor", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            <ul class=\"nav-list nav-list-block\">\r\n                ");
  stack1 = (helper = helpers['gh-tab'] || (depth0 && depth0['gh-tab']),options={hash:{
    'tagName': ("li"),
    'classNames': ("nav-list-item")
  },hashTypes:{'tagName': "STRING",'classNames': "STRING"},hashContexts:{'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(4, program4, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-tab", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            </ul>\r\n\r\n            <div class=\"form-group for-checkbox\">\r\n                <label class=\"checkbox\" for=\"static-page\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "togglePage", {hash:{
    'bubbles': ("false")
  },hashTypes:{'bubbles': "STRING"},hashContexts:{'bubbles': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("checkbox"),
    'name': ("static-page"),
    'id': ("static-page"),
    'class': ("post-setting-static-page"),
    'checked': ("page")
  },hashTypes:{'type': "STRING",'name': "STRING",'id': "STRING",'class': "STRING",'checked': "ID"},hashContexts:{'type': depth0,'name': depth0,'id': depth0,'class': depth0,'checked': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                    <span class=\"input-toggle-component\"></span>\r\n                    <p>Turn this post into a static page</p>\r\n                </label>\r\n\r\n                <label class=\"checkbox\" for=\"featured\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleFeatured", {hash:{
    'bubbles': ("false")
  },hashTypes:{'bubbles': "STRING"},hashContexts:{'bubbles': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("checkbox"),
    'name': ("featured"),
    'id': ("featured"),
    'class': ("post-setting-featured"),
    'checked': ("featured")
  },hashTypes:{'type': "STRING",'name': "STRING",'id': "STRING",'class': "STRING",'checked': "ID"},hashContexts:{'type': depth0,'name': depth0,'id': depth0,'class': depth0,'checked': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                    <span class=\"input-toggle-component\"></span>\r\n                    <p>Feature this post</p>\r\n                </label>\r\n            </div>\r\n\r\n            </form>\r\n        </div>\r\n    </div>\r\n\r\n    <div ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("isViewingSubview:settings-menu-pane-in:settings-menu-pane-out-right :settings-menu :settings-menu-pane")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n    ");
  options={hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[],types:[],data:data}
  if (helper = helpers['gh-tab-pane']) { stack1 = helper.call(depth0, options); }
  else { helper = (depth0 && depth0['gh-tab-pane']); stack1 = typeof helper === functionType ? helper.call(depth0, options) : helper; }
  if (!helpers['gh-tab-pane']) { stack1 = blockHelperMissing.call(depth0, 'gh-tab-pane', {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[],types:[],data:data}); }
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n</div>\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n            <div class=\"form-group for-select\">\r\n                <label for=\"author-list\">Author</label>\r\n                <span class=\"input-icon icon-user\">\r\n                    <span class=\"gh-select\" tabindex=\"0\">\r\n                    ");
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "select", {hash:{
    'name': ("post-setting-author"),
    'id': ("author-list"),
    'content': ("authors"),
    'optionValuePath': ("content.id"),
    'optionLabelPath': ("content.name"),
    'selection': ("selectedAuthor")
  },hashTypes:{'name': "STRING",'id': "STRING",'content': "ID",'optionValuePath': "STRING",'optionLabelPath': "STRING",'selection': "ID"},hashContexts:{'name': depth0,'id': depth0,'content': depth0,'optionValuePath': depth0,'optionLabelPath': depth0,'selection': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("\r\n                    </span>\r\n                </span>\r\n            </div>\r\n            ");
  return buffer;
  }

function program4(depth0,data) {
  
  
  data.buffer.push("\r\n                    <button type=\"button\">\r\n                        <b>Meta Data</b>\r\n                        <span>Extra content for SEO and social media.</span>\r\n                    </button>\r\n                ");
  }

function program6(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n        <div class=\"settings-menu-header subview\">\r\n            <button ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSubview", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" class=\"back icon-chevron-left settings-menu-header-action\"><span class=\"hidden\">Back</span></button>\r\n            <h4>Meta Data</h4>\r\n        </div>\r\n\r\n        <div class=\"settings-menu-content\">\r\n            <form>\r\n            <div class=\"form-group\">\r\n                <label for=\"meta-title\">Meta Title</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'class': ("post-setting-meta-title"),
    'id': ("meta-title"),
    'value': ("metaTitleScratch"),
    'name': ("post-setting-meta-title"),
    'focus-out': ("setMetaTitle"),
    'stopEnterKeyDownPropagation': ("true")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID",'name': "STRING",'focus-out': "STRING",'stopEnterKeyDownPropagation': "STRING"},hashContexts:{'class': depth0,'id': depth0,'value': depth0,'name': depth0,'focus-out': depth0,'stopEnterKeyDownPropagation': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                <p>Recommended: <b>70</b> characters. You’ve used ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-down-characters'] || (depth0 && depth0['gh-count-down-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["ID","INTEGER"],data:data},helper ? helper.call(depth0, "metaTitleScratch", 70, options) : helperMissing.call(depth0, "gh-count-down-characters", "metaTitleScratch", 70, options))));
  data.buffer.push("</p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"meta-description\">Meta Description</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-textarea'] || (depth0 && depth0['gh-textarea']),options={hash:{
    'class': ("post-setting-meta-description"),
    'id': ("meta-description"),
    'value': ("metaDescriptionScratch"),
    'name': ("post-setting-meta-description"),
    'focus-out': ("setMetaDescription"),
    'stopEnterKeyDownPropagation': ("true")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID",'name': "STRING",'focus-out': "STRING",'stopEnterKeyDownPropagation': "STRING"},hashContexts:{'class': depth0,'id': depth0,'value': depth0,'name': depth0,'focus-out': depth0,'stopEnterKeyDownPropagation': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-textarea", options))));
  data.buffer.push("\r\n                <p>Recommended: <b>156</b> characters. You’ve used ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-down-characters'] || (depth0 && depth0['gh-count-down-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["ID","INTEGER"],data:data},helper ? helper.call(depth0, "metaDescriptionScratch", 156, options) : helperMissing.call(depth0, "gh-count-down-characters", "metaDescriptionScratch", 156, options))));
  data.buffer.push("</p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label>Search Engine Result Preview</label>\r\n                <div class=\"seo-preview\">\r\n                    <div class=\"seo-preview-title\">");
  stack1 = helpers._triageMustache.call(depth0, "seoTitle", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                    <div class=\"seo-preview-link\">");
  stack1 = helpers._triageMustache.call(depth0, "seoURL", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                    <div class=\"seo-preview-description\">");
  stack1 = helpers._triageMustache.call(depth0, "seoDescription", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                </div>\r\n            </div>\r\n            </form>\r\n        </div>\r\n    ");
  return buffer;
  }

  data.buffer.push("<div class=\"content-cover\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSettingsMenu", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("></div>\r\n");
  stack1 = (helper = helpers['gh-tabs-manager'] || (depth0 && depth0['gh-tabs-manager']),options={hash:{
    'selected': ("showSubview"),
    'id': ("entry-controls"),
    'class': ("settings-menu-container")
  },hashTypes:{'selected': "STRING",'id': "STRING",'class': "STRING"},hashContexts:{'selected': depth0,'id': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-tabs-manager", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/post-tags-input', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n           <span class=\"tag\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "deleteTag", "tag", {hash:{
    'target': ("view")
  },hashTypes:{'target': "ID"},hashContexts:{'target': depth0},contexts:[depth0,depth0],types:["STRING","ID"],data:data})));
  data.buffer.push(">");
  stack1 = helpers._triageMustache.call(depth0, "tag.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n        ");
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n            ");
  stack1 = helpers.view.call(depth0, "view.suggestionView", {hash:{
    'suggestion': ("suggestion")
  },hashTypes:{'suggestion': "ID"},hashContexts:{'suggestion': depth0},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        ");
  return buffer;
  }
function program4(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                <a href=\"javascript:void(0);\">");
  stack1 = helpers._triageMustache.call(depth0, "view.suggestion.highlightedName", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</a>\r\n            ");
  return buffer;
  }

  data.buffer.push("<div class=\"publish-bar-tags-icon\">\r\n    <label class=\"tag-label icon-tag\" for=\"tags\" title=\"Tags\">\r\n        <span class=\"hidden\">Tags</span>\r\n    </label>\r\n</div>\r\n<div class=\"publish-bar-tags\">\r\n    <div class=\"tags-wrapper tags\">\r\n        ");
  stack1 = helpers.each.call(depth0, "tag", "in", "controller.tags", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n</div>\r\n<div class=\"publish-bar-tags-input\">\r\n    <input type=\"hidden\" class=\"tags-holder\" id=\"tags-holder\">\r\n    ");
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "view.tagInputView", {hash:{
    'class': ("tag-input js-tag-input"),
    'id': ("tags"),
    'value': ("newTagText")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID"},hashContexts:{'class': depth0,'id': depth0,'value': depth0},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("\r\n    <ul class=\"suggestions dropdown-menu dropdown-triangle-bottom\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'style': ("view.overlayStyles")
  },hashTypes:{'style': "ID"},hashContexts:{'style': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        ");
  stack1 = helpers.each.call(depth0, "suggestion", "in", "suggestions", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </ul>\r\n</div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/posts', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  
  data.buffer.push("<span class=\"hidden\">New Post</span>");
  }

function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n        <ol class=\"posts-list\">\r\n            ");
  stack1 = helpers.each.call(depth0, "post", "in", "model", {hash:{
    'itemController': ("posts/post"),
    'itemView': ("post-item-view"),
    'itemTagName': ("li")
  },hashTypes:{'itemController': "STRING",'itemView': "STRING",'itemTagName': "STRING"},hashContexts:{'itemController': depth0,'itemView': depth0,'itemTagName': depth0},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </ol>\r\n        ");
  return buffer;
  }
function program4(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n            ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("permalink"),
    'title': ("Edit this post")
  },hashTypes:{'class': "STRING",'title': "STRING"},hashContexts:{'class': depth0,'title': depth0},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0,depth0],types:["STRING","ID"],data:data},helper ? helper.call(depth0, "posts.post", "post", options) : helperMissing.call(depth0, "link-to", "posts.post", "post", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            ");
  return buffer;
  }
function program5(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n            <h3 class=\"entry-title\">");
  stack1 = helpers._triageMustache.call(depth0, "post.title", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h3>\r\n            <section class=\"entry-meta\">\r\n                <span class=\"status\">\r\n                    ");
  stack1 = helpers['if'].call(depth0, "post.isPublished", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(11, program11, data),fn:self.program(6, program6, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </span>\r\n            </section>\r\n            ");
  return buffer;
  }
function program6(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                    ");
  stack1 = helpers['if'].call(depth0, "post.page", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                    ");
  return buffer;
  }
function program7(depth0,data) {
  
  
  data.buffer.push("\r\n                    <span class=\"page\">Page</span>\r\n                    ");
  }

function program9(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                    <time datetime=\"");
  data.buffer.push(escapeExpression(helpers.unbound.call(depth0, "post.published_at", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("\" class=\"date published\">\r\n                        Published ");
  data.buffer.push(escapeExpression((helper = helpers['gh-format-timeago'] || (depth0 && depth0['gh-format-timeago']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "post.published_at", options) : helperMissing.call(depth0, "gh-format-timeago", "post.published_at", options))));
  data.buffer.push("\r\n                    </time>\r\n                    ");
  return buffer;
  }

function program11(depth0,data) {
  
  
  data.buffer.push("\r\n                    <span class=\"draft\">Draft</span>\r\n                    ");
  }

  data.buffer.push("<header class=\"page-header\">\r\n    <button class=\"menu-button js-menu-button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleGlobalMobileNav", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"sr-only\">Menu</span></button>\r\n    <h2 class=\"page-title\">Content</h2>\r\n</header>\r\n\r\n<div class=\"page-content\">\r\n    <section ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":content-list :js-content-list postListFocused:keyboard-focused")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <header class=\"floatingheader\">\r\n            <section class=\"content-filter\">\r\n                <small>All Posts</small>\r\n            </section>\r\n            ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-green"),
    'title': ("New Post")
  },hashTypes:{'class': "STRING",'title': "STRING"},hashContexts:{'class': depth0,'title': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "editor.new", options) : helperMissing.call(depth0, "link-to", "editor.new", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </header>\r\n        ");
  stack1 = helpers.view.call(depth0, "paginated-scroll-box", {hash:{
    'tagName': ("section"),
    'classNames': ("content-list-content js-content-scrollbox")
  },hashTypes:{'tagName': "STRING",'classNames': "STRING"},hashContexts:{'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["STRING"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </section>\r\n    <section ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":content-preview :js-content-preview postContentFocused:keyboard-focused")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        ");
  stack1 = helpers._triageMustache.call(depth0, "outlet", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </section>\r\n</div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/posts/index', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n<div class=\"no-posts\">\r\n    <h3>You Haven't Written Any Posts Yet!</h3>\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "editor.new", options) : helperMissing.call(depth0, "link-to", "editor.new", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</div>\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  
  data.buffer.push("<button type=\"button\" class=\"btn btn-green btn-lg\" title=\"New Post\">Write a new Post</button>");
  }

  stack1 = helpers['if'].call(depth0, "noPosts", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/posts/post', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program3(depth0,data) {
  
  
  data.buffer.push("Published");
  }

function program5(depth0,data) {
  
  
  data.buffer.push("Written");
  }

function program7(depth0,data) {
  
  var stack1;
  stack1 = helpers._triageMustache.call(depth0, "author.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  else { data.buffer.push(''); }
  }

function program9(depth0,data) {
  
  var stack1;
  stack1 = helpers._triageMustache.call(depth0, "author.email", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  else { data.buffer.push(''); }
  }

function program11(depth0,data) {
  
  
  data.buffer.push(" Edit");
  }

function program13(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n    <div class=\"wrapper\">\r\n        <h1>");
  stack1 = helpers._triageMustache.call(depth0, "title", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h1>\r\n        ");
  data.buffer.push(escapeExpression((helper = helpers['gh-format-html'] || (depth0 && depth0['gh-format-html']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "html", options) : helperMissing.call(depth0, "gh-format-html", "html", options))));
  data.buffer.push("\r\n    </div>\r\n");
  return buffer;
  }

  data.buffer.push("<header class=\"post-preview-header clearfix\">\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'tagName': ("button"),
    'class': ("btn btn-default btn-back")
  },hashTypes:{'tagName': "STRING",'class': "STRING"},hashContexts:{'tagName': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "posts", options) : helperMissing.call(depth0, "link-to", "posts", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <h2 class=\"page-title\">Preview</h2>\r\n    <button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("featured:featured:unfeatured")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" title=\"Feature this post\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleFeatured", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n        <span class=\"hidden\">Star</span>\r\n    </button>\r\n    <small class=\"post-published-by\">\r\n        <span class=\"status\">");
  stack1 = helpers['if'].call(depth0, "isPublished", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n        <span class=\"normal\">by</span>\r\n        <span class=\"author\">");
  stack1 = helpers['if'].call(depth0, "author.name", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n    </small>\r\n    <section class=\"post-controls\">\r\n        ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default post-edit")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(11, program11, data),contexts:[depth0,depth0],types:["STRING","ID"],data:data},helper ? helper.call(depth0, "editor.edit", "", options) : helperMissing.call(depth0, "link-to", "editor.edit", "", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </section>\r\n</header>\r\n\r\n");
  stack1 = helpers.view.call(depth0, "content-preview-content-view", {hash:{
    'tagName': ("section")
  },hashTypes:{'tagName': "STRING"},hashContexts:{'tagName': depth0},inverse:self.noop,fn:self.program(13, program13, data),contexts:[depth0],types:["STRING"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/reset', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  data.buffer.push("<section class=\"reset-box js-reset-box fade-in\">\r\n    <form id=\"reset\" class=\"reset-form\" method=\"post\" novalidate=\"novalidate\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "submit", {hash:{
    'on': ("submit")
  },hashTypes:{'on': "STRING"},hashContexts:{'on': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n        <div class=\"password-wrap\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("newPassword"),
    'class': ("password"),
    'type': ("password"),
    'placeholder': ("Password"),
    'name': ("newpassword"),
    'autofocus': ("autofocus")
  },hashTypes:{'value': "ID",'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'autofocus': "STRING"},hashContexts:{'value': depth0,'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'autofocus': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n        </div>\r\n        <div class=\"password-wrap\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("ne2Password"),
    'class': ("password"),
    'type': ("password"),
    'placeholder': ("Confirm Password"),
    'name': ("ne2password")
  },hashTypes:{'value': "ID",'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING"},hashContexts:{'value': depth0,'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n        </div>\r\n        <button class=\"btn btn-blue\" type=\"submit\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitButtonDisabled")
  },hashTypes:{'disabled': "STRING"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Reset Password</button>\r\n    </form>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.general"),
    'title': ("General"),
    'classNames': ("settings-nav-general icon-settings")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.users"),
    'title': ("Users"),
    'classNames': ("settings-nav-users icon-users")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.tags"),
    'title': ("Tags"),
    'classNames': ("settings-nav-tags icon-tag")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.code-injection"),
    'title': ("Code Injection"),
    'classNames': ("settings-nav-code icon-code")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.labs"),
    'title': ("Labs"),
    'classNames': ("settings-nav-labs icon-atom")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-activating-list-item'] || (depth0 && depth0['gh-activating-list-item']),options={hash:{
    'route': ("settings.about"),
    'title': ("About"),
    'classNames': ("settings-nav-about icon-pacman")
  },hashTypes:{'route': "STRING",'title': "STRING",'classNames': "STRING"},hashContexts:{'route': depth0,'title': depth0,'classNames': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-activating-list-item", options))));
  data.buffer.push("\r\n            ");
  return buffer;
  }

  data.buffer.push("<header class=\"page-header\">\r\n    <button class=\"menu-button js-menu-button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleGlobalMobileNav", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("><span class=\"sr-only\">Menu</span></button>\r\n    <h2 class=\"page-title\">Settings</h2>\r\n</header>\r\n\r\n<div class=\"page-content\">\r\n    <nav class=\"settings-nav js-settings-menu\">\r\n        <ul>\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showGeneral", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showUsers", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showTags", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showCodeInjection", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(7, program7, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showLabs", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(9, program9, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            ");
  stack1 = helpers['if'].call(depth0, "showAbout", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(11, program11, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </ul>\r\n    </nav>\r\n\r\n    ");
  stack1 = helpers._triageMustache.call(depth0, "outlet", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</div>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/about', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program3(depth0,data) {
  
  var stack1;
  stack1 = helpers._triageMustache.call(depth0, "mail", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  else { data.buffer.push(''); }
  }

function program5(depth0,data) {
  
  
  data.buffer.push("Native");
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    <h2 class=\"page-title\">About</h2>\r\n    <div class=\"js-settings-header-inner settings-header-inner\">\r\n        ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n</header>\r\n\r\n<section class=\"content settings-about\">\r\n    <section class=\"about-ghost-intro\">\r\n        <h1>\r\n            <span class=\"ghost_logo\">\r\n                <span class=\"hidden\">Ghost</span>\r\n            </span>\r\n            <span class=\"version blue\">v");
  stack1 = helpers._triageMustache.call(depth0, "version", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n        </h1>\r\n        <p>A free, open, simple publishing platform</p>\r\n\r\n        <div class=\"about-environment-help clearfix\">\r\n            <div class=\"about-environment\">\r\n                <dl>\r\n                    <dt>Version:</dt>\r\n                    <dd class=\"about-environment-detail\">");
  stack1 = helpers._triageMustache.call(depth0, "version", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</dd>\r\n                    <dt>Environment:</dt>\r\n                    <dd class=\"about-environment-detail\">");
  stack1 = helpers._triageMustache.call(depth0, "environment", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</dd>\r\n                    <dt>Database:</dt>\r\n                    <dd class=\"about-environment-detail about-environment-database\">");
  stack1 = helpers._triageMustache.call(depth0, "database", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</dd>\r\n                    <dt>Mail:</dt>\r\n                    <dd class=\"about-environment-detail\">");
  stack1 = helpers['if'].call(depth0, "mail", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</dd>\r\n                </dl>\r\n            </div>\r\n            <div class=\"about-help\">\r\n                <a href=\"http://support.ghost.org\" class=\"btn\">User Documentation</a>\r\n                <a href=\"https://ghost.org/forum/\" class=\"btn\">Get Help With Ghost</a>\r\n            </div>\r\n        </div>\r\n    </section>\r\n\r\n    <section class=\"about-credits\">\r\n        <h1>The People Who Made it Possible</h1>\r\n\r\n        <ul class=\"top-contributors clearfix\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "contributors", options) : helperMissing.call(depth0, "partial", "contributors", options))));
  data.buffer.push("\r\n        </ul>\r\n\r\n        <p class=\"about-contributors-info\">Ghost is built by an incredible group of contributors from all over the world. Here are just a few of the people who helped create the version you’re using right now.</p>\r\n\r\n        <a href=\"https://ghost.org/about/contribute/\" class=\"about-get-involved btn-blue btn-lg btn\">Find out how you can get involved</a>\r\n\r\n        <p class=\"about-copyright\">\r\n            Copyright 2013 - 2014 Ghost Foundation, released under the <a href=\"https://github.com/TryGhost/Ghost/blob/master/LICENSE\">MIT license</a>.\r\n            <br>\r\n            <a href=\"https://ghost.org/\">Ghost</a> is a trademark of the <a href=\"https://ghost.org/about/\">Ghost Foundation</a>.\r\n        </p>\r\n    </section>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/apps', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program3(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n        <tr>\r\n            <td>\r\n                ");
  stack1 = helpers['if'].call(depth0, "app.package", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(6, program6, data),fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            </td>\r\n            <td>\r\n                <button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleApp", "app", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["ID","ID"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': (":btn :js-button-active activeClass:btn-red inactiveClass:btn-green activeClass:js-button-deactivate")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n                    ");
  stack1 = helpers._triageMustache.call(depth0, "app.buttonText", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </button>\r\n            </td>\r\n        </tr>\r\n        ");
  return buffer;
  }
function program4(depth0,data) {
  
  var buffer = '', stack1;
  stack1 = helpers._triageMustache.call(depth0, "app.package.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(" - ");
  stack1 = helpers._triageMustache.call(depth0, "app.package.version", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = '', stack1;
  stack1 = helpers._triageMustache.call(depth0, "app.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push(" - package.json missing :(");
  return buffer;
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <h2 class=\"title\">Apps</h2>\r\n</header>\r\n\r\n<section class=\"content settings-apps\">\r\n    <table class=\"js-apps\">\r\n        <thead>\r\n            <th>App name</th>\r\n            <th>Status</th>\r\n        </thead>\r\n        <tbody>\r\n        ");
  stack1 = helpers.each.call(depth0, "app", "in", "model", {hash:{
    'itemController': ("settings/app")
  },hashTypes:{'itemController': "STRING"},hashContexts:{'itemController': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </tbody>\r\n    </table>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/code-injection', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <h2 class=\"page-title\">Code Injection</h2>\r\n    <section class=\"page-actions\">\r\n        <button type=\"button\" class=\"btn btn-blue\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "save", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Save</button>\r\n    </section>\r\n</header>\r\n\r\n<section class=\"content settings-code\">\r\n    <form id=\"settings-code\" novalidate=\"novalidate\">\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <p>\r\n                    Ghost allows you to inject code into the top and bottom of your template files without editing them. This allows for quick modifications to insert useful things like tracking codes and meta data.\r\n                </p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"ghost-head\">Blog Header</label>\r\n                <p>Code here will be injected to the {{ghost_head}} helper at the top of your page</p>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{
    'id': ("ghost-head"),
    'name': ("codeInjection[ghost_head]"),
    'type': ("text"),
    'value': ("ghost_head")
  },hashTypes:{'id': "STRING",'name': "STRING",'type': "STRING",'value': "ID"},hashContexts:{'id': depth0,'name': depth0,'type': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "textarea", options))));
  data.buffer.push("\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"ghost-foot\">Blog Footer</label>\r\n                <p>Code here will be injected to the {{ghost_foot}} helper at the bottom of your page</p>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{
    'id': ("ghost-foot"),
    'name': ("codeInjection[ghost_foot]"),
    'type': ("text"),
    'value': ("ghost_foot")
  },hashTypes:{'id': "STRING",'name': "STRING",'type': "STRING",'value': "ID"},hashContexts:{'id': depth0,'name': depth0,'type': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "textarea", options))));
  data.buffer.push("\r\n            </div>\r\n        </fieldset>\r\n    </form>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/general', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program3(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n                <button type=\"button\" class=\"js-modal-logo\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "", "logo", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push("><img id=\"blog-logo\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'src': ("logo")
  },hashTypes:{'src': "ID"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" alt=\"logo\"></button>\r\n            ");
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n                <button type=\"button\" class=\"btn btn-green js-modal-logo\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "", "logo", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push(">Upload Image</button>\r\n            ");
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n                <button type=\"button\" class=\"js-modal-cover\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "", "cover", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push("><img id=\"blog-cover\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'src': ("cover")
  },hashTypes:{'src': "ID"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" alt=\"cover photo\"></button>\r\n            ");
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n                <button type=\"button\" class=\"btn btn-green js-modal-cover\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "", "cover", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push(">Upload Image</button>\r\n            ");
  return buffer;
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <h2 class=\"page-title\">General</h2>\r\n    <section class=\"page-actions\">\r\n        <button type=\"button\" class=\"btn btn-blue\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "save", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Save</button>\r\n    </section>\r\n</header>\r\n\r\n<section class=\"content settings-general\">\r\n    <form id=\"settings-general\" novalidate=\"novalidate\">\r\n        <fieldset>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"blog-title\">Blog Title</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'id': ("blog-title"),
    'name': ("general[title]"),
    'type': ("text"),
    'value': ("title")
  },hashTypes:{'id': "STRING",'name': "STRING",'type': "STRING",'value': "ID"},hashContexts:{'id': depth0,'name': depth0,'type': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>The name of your blog</p>\r\n            </div>\r\n\r\n            <div class=\"form-group description-container\">\r\n                <label for=\"blog-description\">Blog Description</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{
    'id': ("blog-description"),
    'name': ("general[description]"),
    'value': ("description")
  },hashTypes:{'id': "STRING",'name': "STRING",'value': "ID"},hashContexts:{'id': depth0,'name': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "textarea", options))));
  data.buffer.push("\r\n                <p>\r\n                    Describe what your blog is about\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-characters'] || (depth0 && depth0['gh-count-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "description", options) : helperMissing.call(depth0, "gh-count-characters", "description", options))));
  data.buffer.push("\r\n                </p>\r\n\r\n            </div>\r\n        </fieldset>\r\n\r\n        <div class=\"form-group\">\r\n            <label for=\"blog-logo\">Blog Logo</label>\r\n            ");
  stack1 = helpers['if'].call(depth0, "logo", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            <p>Display a sexy logo for your publication</p>\r\n        </div>\r\n\r\n        <div class=\"form-group\">\r\n            <label for=\"blog-cover\">Blog Cover</label>\r\n            ");
  stack1 = helpers['if'].call(depth0, "cover", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            <p>Display a cover image on your site</p>\r\n        </div>\r\n\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label for=\"email-address\">Email Address</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'id': ("email-address"),
    'name': ("general[email-address]"),
    'type': ("email"),
    'value': ("email"),
    'autocapitalize': ("off"),
    'autocorrect': ("off")
  },hashTypes:{'id': "STRING",'name': "STRING",'type': "STRING",'value': "ID",'autocapitalize': "STRING",'autocorrect': "STRING"},hashContexts:{'id': depth0,'name': depth0,'type': depth0,'value': depth0,'autocapitalize': depth0,'autocorrect': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Address to use for admin notifications</p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"postsPerPage\">Posts per page</label>\r\n                \r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'id': ("postsPerPage"),
    'name': ("general[postsPerPage]"),
    'focus-out': ("checkPostsPerPage"),
    'value': ("postsPerPage"),
    'min': ("1"),
    'max': ("1000"),
    'type': ("number"),
    'pattern': ("[0-9]*")
  },hashTypes:{'id': "STRING",'name': "STRING",'focus-out': "STRING",'value': "ID",'min': "STRING",'max': "STRING",'type': "STRING",'pattern': "STRING"},hashContexts:{'id': depth0,'name': depth0,'focus-out': depth0,'value': depth0,'min': depth0,'max': depth0,'type': depth0,'pattern': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>How many posts should be displayed on each page</p>\r\n            </div>\r\n\r\n            <div class=\"form-group for-checkbox\">\r\n                <label for=\"permalinks\">Dated Permalinks</label>\r\n                <label class=\"checkbox\" for=\"permalinks\">\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'id': ("permalinks"),
    'name': ("general[permalinks]"),
    'type': ("checkbox"),
    'checked': ("isDatedPermalinks")
  },hashTypes:{'id': "STRING",'name': "STRING",'type': "STRING",'checked': "ID"},hashContexts:{'id': depth0,'name': depth0,'type': depth0,'checked': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                    <span class=\"input-toggle-component\"></span>\r\n                    <p>Include the date in your post URLs</p>\r\n                </label>\r\n            </div>\r\n\r\n            <div class=\"form-group for-select\">\r\n                <label for=\"activeTheme\">Theme</label>\r\n                <span class=\"gh-select\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'data-select-text': ("selectedTheme.label")
  },hashTypes:{'data-select-text': "ID"},hashContexts:{'data-select-text': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" tabindex=\"0\">\r\n                   ");
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "select", {hash:{
    'id': ("activeTheme"),
    'name': ("general[activeTheme]"),
    'content': ("themes"),
    'optionValuePath': ("content.name"),
    'optionLabelPath': ("content.label"),
    'value': ("activeTheme"),
    'selection': ("selectedTheme")
  },hashTypes:{'id': "STRING",'name': "STRING",'content': "ID",'optionValuePath': "STRING",'optionLabelPath': "STRING",'value': "ID",'selection': "ID"},hashContexts:{'id': depth0,'name': depth0,'content': depth0,'optionValuePath': depth0,'optionLabelPath': depth0,'value': depth0,'selection': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("\r\n               </span>\r\n                <p>Select a theme for your blog</p>\r\n            </div>\r\n        </fieldset>\r\n    </form>\r\n</section>");
  return buffer;
  
}); });

define('ghost/templates/settings/labs', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program3(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label>Import</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "import-errors", options) : helperMissing.call(depth0, "partial", "import-errors", options))));
  data.buffer.push("\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-file-upload'] || (depth0 && depth0['gh-file-upload']),options={hash:{
    'id': ("importfile"),
    'uploadButtonText': ("uploadButtonText")
  },hashTypes:{'id': "STRING",'uploadButtonText': "ID"},hashContexts:{'id': depth0,'uploadButtonText': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-file-upload", options))));
  data.buffer.push("\r\n                <p>Import from another Ghost installation. If you import a user, this will replace the current user & log you out.</p>\r\n            </div>\r\n        </fieldset>\r\n    ");
  return buffer;
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    <h2 class=\"page-title\">Labs</h2>\r\n    <div class=\"js-settings-header-inner settings-header-inner\">\r\n        ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n</header>\r\n\r\n\r\n<section class=\"content settings-debug\">\r\n    <form id=\"settings-export\">\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label>Export</label>\r\n                <button type=\"button\" class=\"btn btn-blue\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "exportData", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Export</button>\r\n                <p>Export the blog settings and data.</p>\r\n            </div>\r\n        </fieldset>\r\n    </form>\r\n    ");
  stack1 = (helper = helpers['gh-form'] || (depth0 && depth0['gh-form']),options={hash:{
    'id': ("settings-import"),
    'enctype': ("multipart/form-data")
  },hashTypes:{'id': "STRING",'enctype': "STRING"},hashContexts:{'id': depth0,'enctype': depth0},inverse:self.noop,fn:self.program(3, program3, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-form", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <form id=\"settings-resetdb\">\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label>Delete all Content</label>\r\n                <button type=\"button\" class=\"btn btn-red js-delete\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "deleteAll", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(">Delete</button>\r\n                <p>Delete all posts and tags from the database.</p>\r\n            </div>\r\n        </fieldset>\r\n    </form>\r\n    <form id=\"settings-testmail\">\r\n        <fieldset>\r\n            <div class=\"form-group\">\r\n                <label>Send a test email</label>\r\n                <button type=\"button\" id=\"sendtestmail\" class=\"btn btn-blue\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "sendTestEmail", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Send</button>\r\n                <p>Sends a test email to your address.</p>\r\n            </div>\r\n        </fieldset>\r\n    </form>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/tags', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n        <div class=\"settings-tag\">\r\n            <button class=\"tag-edit-button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "editTag", "tag", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","ID"],data:data})));
  data.buffer.push(">\r\n                <span class=\"tag-title\">");
  stack1 = helpers._triageMustache.call(depth0, "tag.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n                <span class=\"label label-default\">/");
  stack1 = helpers._triageMustache.call(depth0, "tag.slug", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n                <p class=\"tag-description\">");
  stack1 = helpers._triageMustache.call(depth0, "tag.description", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</p>\r\n                <span class=\"tags-count\">N/A</span>\r\n            </button>\r\n        </div>\r\n    ");
  return buffer;
  }

  data.buffer.push("<header class=\"settings-view-header\">\r\n    <a class=\"btn btn-default btn-back active\" href=\"/ghost/settings/\">Back</a>\r\n    <h2 class=\"page-title\">Tags</h2>\r\n    <section class=\"page-actions\">\r\n        <button type=\"button\" class=\"btn btn-green\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "newTag", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">New Tag</button>\r\n    </section>\r\n</header>\r\n\r\n<section class=\"content settings-tags\">\r\n    ");
  stack1 = helpers.each.call(depth0, "tag", "in", "tags", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/tags/settings-menu', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this, functionType="function", blockHelperMissing=helpers.blockHelperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n    <div ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("isViewingSubview:settings-menu-pane-out-left:settings-menu-pane-in :settings-menu :settings-menu-pane")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <div class=\"settings-menu-header\">\r\n            <h4>Tag Settings</h4>\r\n            <button class=\"close icon-x settings-menu-header-action\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSettingsMenu", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n                <span class=\"hidden\">Close</span>\r\n            </button>\r\n        </div>\r\n        <div class=\"settings-menu-content\">\r\n            ");
  data.buffer.push(escapeExpression((helper = helpers['gh-uploader'] || (depth0 && depth0['gh-uploader']),options={hash:{
    'uploaded': ("setCoverImage"),
    'canceled': ("clearCoverImage"),
    'description': ("Add tag image"),
    'image': ("activeTag.image"),
    'uploaderReference': ("uploaderReference"),
    'tagName': ("section")
  },hashTypes:{'uploaded': "STRING",'canceled': "STRING",'description': "STRING",'image': "ID",'uploaderReference': "ID",'tagName': "STRING"},hashContexts:{'uploaded': depth0,'canceled': depth0,'description': depth0,'image': depth0,'uploaderReference': depth0,'tagName': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-uploader", options))));
  data.buffer.push("\r\n            <form>\r\n                <div class=\"form-group\">\r\n                    <label>Tag Name</label>\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'type': ("text"),
    'value': ("activeTagNameScratch"),
    'focus-out': ("saveActiveTagName")
  },hashTypes:{'type': "STRING",'value': "ID",'focus-out': "STRING"},hashContexts:{'type': depth0,'value': depth0,'focus-out': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                </div>\r\n\r\n                <div class=\"form-group\">\r\n                    <label>Slug</label>\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'type': ("text"),
    'value': ("activeTagSlugScratch"),
    'focus-out': ("saveActiveTagSlug")
  },hashTypes:{'type': "STRING",'value': "ID",'focus-out': "STRING"},hashContexts:{'type': depth0,'value': depth0,'focus-out': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                </div>\r\n\r\n                <div class=\"form-group\">\r\n                    <label>Description</label>\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-textarea'] || (depth0 && depth0['gh-textarea']),options={hash:{
    'value': ("activeTagDescriptionScratch"),
    'focus-out': ("saveActiveTagDescription")
  },hashTypes:{'value': "ID",'focus-out': "STRING"},hashContexts:{'value': depth0,'focus-out': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-textarea", options))));
  data.buffer.push("\r\n                </div>\r\n\r\n                <ul class=\"nav-list nav-list-block\">\r\n                    ");
  stack1 = (helper = helpers['gh-tab'] || (depth0 && depth0['gh-tab']),options={hash:{
    'tagName': ("li"),
    'classNames': ("nav-list-item")
  },hashTypes:{'tagName': "STRING",'classNames': "STRING"},hashContexts:{'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(2, program2, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-tab", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </ul>\r\n\r\n                ");
  stack1 = helpers.unless.call(depth0, "activeTag.isNew", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            </form>\r\n        </div>\r\n    </div>\r\n\r\n    <div ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'class': ("isViewingSubview:settings-menu-pane-in:settings-menu-pane-out-right :settings-menu :settings-menu-pane")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        ");
  options={hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[],types:[],data:data}
  if (helper = helpers['gh-tab-pane']) { stack1 = helper.call(depth0, options); }
  else { helper = (depth0 && depth0['gh-tab-pane']); stack1 = typeof helper === functionType ? helper.call(depth0, options) : helper; }
  if (!helpers['gh-tab-pane']) { stack1 = blockHelperMissing.call(depth0, 'gh-tab-pane', {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[],types:[],data:data}); }
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    </div>\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  
  data.buffer.push("\r\n                        <button type=\"button\">\r\n                            <b>Meta Data</b>\r\n                            <span>Extra content for SEO and social media.</span>\r\n                        </button>\r\n                    ");
  }

function program4(depth0,data) {
  
  var buffer = '';
  data.buffer.push("\r\n                    <button type=\"button\" class=\"btn btn-red icon-trash\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "deleteTag", "activeTag", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","ID"],data:data})));
  data.buffer.push(">Delete Tag</button>\r\n                ");
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n            <div class=\"settings-menu-header subview\">\r\n                <button ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSubview", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" class=\"back icon-chevron-left settings-menu-header-action\"><span class=\"hidden\">Back</span></button>\r\n                <h4>Meta Data</h4>\r\n            </div>\r\n\r\n            <div class=\"settings-menu-content\">\r\n                <form>\r\n                <div class=\"form-group\">\r\n                    <label for=\"meta-title\">Meta Title</label>\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'type': ("text"),
    'value': ("activeTagMetaTitleScratch"),
    'focus-out': ("saveActiveTagMetaTitle")
  },hashTypes:{'type': "STRING",'value': "ID",'focus-out': "STRING"},hashContexts:{'type': depth0,'value': depth0,'focus-out': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                    <p>Recommended: <b>70</b> characters. You’ve used ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-down-characters'] || (depth0 && depth0['gh-count-down-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["ID","INTEGER"],data:data},helper ? helper.call(depth0, "activeTagMetaTitleScratch", 70, options) : helperMissing.call(depth0, "gh-count-down-characters", "activeTagMetaTitleScratch", 70, options))));
  data.buffer.push("</p>\r\n                </div>\r\n\r\n                <div class=\"form-group\">\r\n                    <label for=\"meta-description\">Meta Description</label>\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-textarea'] || (depth0 && depth0['gh-textarea']),options={hash:{
    'value': ("activeTagMetaDescriptionScratch"),
    'focus-out': ("saveActiveTagMetaDescription")
  },hashTypes:{'value': "ID",'focus-out': "STRING"},hashContexts:{'value': depth0,'focus-out': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-textarea", options))));
  data.buffer.push("\r\n                    <p>Recommended: <b>156</b> characters. You’ve used ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-down-characters'] || (depth0 && depth0['gh-count-down-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["ID","INTEGER"],data:data},helper ? helper.call(depth0, "activeTagMetaDescriptionScratch", 156, options) : helperMissing.call(depth0, "gh-count-down-characters", "activeTagMetaDescriptionScratch", 156, options))));
  data.buffer.push("</p>\r\n                </div>\r\n\r\n                <div class=\"form-group\">\r\n                    <label>Search Engine Result Preview</label>\r\n                    <div class=\"seo-preview\">\r\n                        <div class=\"seo-preview-title\">");
  stack1 = helpers._triageMustache.call(depth0, "seoTitle", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                        <div class=\"seo-preview-link\">");
  stack1 = helpers._triageMustache.call(depth0, "seoURL", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                        <div class=\"seo-preview-description\">");
  stack1 = helpers._triageMustache.call(depth0, "seoDescription", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</div>\r\n                    </div>\r\n                </form>\r\n            </div>\r\n        ");
  return buffer;
  }

  data.buffer.push("<div class=\"content-cover\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "closeSettingsMenu", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push("></div>\r\n");
  stack1 = (helper = helpers['gh-tabs-manager'] || (depth0 && depth0['gh-tabs-manager']),options={hash:{
    'selected': ("showSubview"),
    'class': ("settings-menu-container")
  },hashTypes:{'selected': "STRING",'class': "STRING"},hashContexts:{'selected': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-tabs-manager", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/users', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1;


  data.buffer.push("\r\n");
  stack1 = helpers._triageMustache.call(depth0, "outlet", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/users/index', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, self=this, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n    <header class=\"settings-view-header user-list-header\">\r\n        ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings", options) : helperMissing.call(depth0, "link-to", "settings", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        <h2 class=\"page-title\">Users</h2>\r\n        <section class=\"page-actions\">\r\n            <button class=\"btn btn-green\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "invite-new-user", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","STRING"],data:data})));
  data.buffer.push(" >New&nbsp;User</button>\r\n        </section>\r\n    </header>\r\n\r\n    <section class=\"content settings-users\">\r\n\r\n    ");
  stack1 = helpers['if'].call(depth0, "invitedUsers", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n    <section class=\"user-list active-users\">\r\n\r\n        <h4 class=\"user-list-title\">Active users</h4>\r\n\r\n        ");
  stack1 = helpers.each.call(depth0, "user", "in", "activeUsers", {hash:{
    'itemController': ("settings/users/user")
  },hashTypes:{'itemController': "STRING"},hashContexts:{'itemController': depth0},inverse:self.noop,fn:self.program(10, program10, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n    </section>\r\n\r\n    </section>\r\n\r\n");
  return buffer;
  }
function program2(depth0,data) {
  
  
  data.buffer.push("Back");
  }

function program4(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n\r\n        <section class=\"user-list invited-users\">\r\n\r\n            <h4 class=\"user-list-title\">Invited users</h4>\r\n\r\n            ");
  stack1 = helpers.each.call(depth0, "user", "in", "invitedUsers", {hash:{
    'itemController': ("settings/users/user")
  },hashTypes:{'itemController': "STRING"},hashContexts:{'itemController': depth0},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n        </section>\r\n\r\n    ");
  return buffer;
  }
function program5(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                <div class=\"user-list-item\">\r\n                    <span class=\"user-list-item-icon icon-mail\">ic</span>\r\n\r\n                    <div class=\"user-list-item-body\">\r\n                        <span class=\"name\">");
  stack1 = helpers._triageMustache.call(depth0, "user.email", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span><br>\r\n                            ");
  stack1 = helpers['if'].call(depth0, "user.pending", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(8, program8, data),fn:self.program(6, program6, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                    </div>\r\n                    <aside class=\"user-list-item-aside\">\r\n                        <a class=\"user-list-action\" href=\"#\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "revoke", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Revoke</a>\r\n                        <a class=\"user-list-action\" href=\"#\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "resend", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Resend</a>\r\n                    </aside>\r\n                </div>\r\n            ");
  return buffer;
  }
function program6(depth0,data) {
  
  
  data.buffer.push("\r\n                                <span class=\"red\">Invitation not sent - please try again</span>\r\n                            ");
  }

function program8(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                                <span class=\"description\">Invitation sent: ");
  stack1 = helpers._triageMustache.call(depth0, "user.created_at", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n                            ");
  return buffer;
  }

function program10(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n            ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("user-list-item")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(11, program11, data),contexts:[depth0,depth0],types:["STRING","ID"],data:data},helper ? helper.call(depth0, "settings.users.user", "user", options) : helperMissing.call(depth0, "link-to", "settings.users.user", "user", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        ");
  return buffer;
  }
function program11(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                <span class=\"user-list-item-figure\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'style': ("user.image")
  },hashTypes:{'style': "ID"},hashContexts:{'style': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n                    <span class=\"hidden\">Photo of ");
  data.buffer.push(escapeExpression(helpers.unbound.call(depth0, "user.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("</span>\r\n                </span>\r\n\r\n                <div class=\"user-list-item-body\">\r\n                    <span class=\"name\">\r\n                        ");
  stack1 = helpers._triageMustache.call(depth0, "user.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                    </span>\r\n                    <br>\r\n                    <span class=\"description\">Last seen: ");
  data.buffer.push(escapeExpression(helpers.unbound.call(depth0, "user.last_login", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("</span>\r\n                </div>\r\n                <aside class=\"user-list-item-aside\">\r\n                    ");
  stack1 = helpers.unless.call(depth0, "user.isAuthor", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(12, program12, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                </aside>\r\n            ");
  return buffer;
  }
function program12(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                        ");
  stack1 = helpers.each.call(depth0, "role", "in", "user.roles", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(13, program13, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                    ");
  return buffer;
  }
function program13(depth0,data) {
  
  var buffer = '', stack1;
  data.buffer.push("\r\n                            <span class=\"role-label ");
  data.buffer.push(escapeExpression(helpers.unbound.call(depth0, "role.lowerCaseName", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data})));
  data.buffer.push("\">");
  stack1 = helpers._triageMustache.call(depth0, "role.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</span>\r\n                        ");
  return buffer;
  }

  stack1 = helpers.view.call(depth0, "settings/users/users-list-view", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n");
  return buffer;
  
}); });

define('ghost/templates/settings/users/user', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n        ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("btn btn-default btn-back"),
    'tagName': ("button")
  },hashTypes:{'class': "STRING",'tagName': "STRING"},hashContexts:{'class': depth0,'tagName': depth0},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "settings.users", options) : helperMissing.call(depth0, "link-to", "settings.users", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    ");
  return buffer;
  }
function program2(depth0,data) {
  
  
  data.buffer.push("<i class=\"icon-chevron-left\"></i>Users");
  }

function program4(depth0,data) {
  
  var buffer = '', stack1, helper, options;
  data.buffer.push("\r\n            <span class=\"dropdown\">\r\n                ");
  stack1 = (helper = helpers['gh-dropdown-button'] || (depth0 && depth0['gh-dropdown-button']),options={hash:{
    'dropdownName': ("user-actions-menu"),
    'classNames': ("btn btn-default only-has-icon user-actions-cog"),
    'title': ("User Actions")
  },hashTypes:{'dropdownName': "STRING",'classNames': "STRING",'title': "STRING"},hashContexts:{'dropdownName': depth0,'classNames': depth0,'title': depth0},inverse:self.noop,fn:self.program(5, program5, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown-button", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n                ");
  stack1 = (helper = helpers['gh-dropdown'] || (depth0 && depth0['gh-dropdown']),options={hash:{
    'name': ("user-actions-menu"),
    'tagName': ("ul"),
    'classNames': ("user-actions-menu dropdown-menu dropdown-triangle-top-right")
  },hashTypes:{'name': "STRING",'tagName': "STRING",'classNames': "STRING"},hashContexts:{'name': depth0,'tagName': depth0,'classNames': depth0},inverse:self.noop,fn:self.program(7, program7, data),contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-dropdown", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            </span>\r\n        ");
  return buffer;
  }
function program5(depth0,data) {
  
  
  data.buffer.push("\r\n                    <i class=\"icon-settings\"></i>\r\n                    <span class=\"hidden\">User Settings</span>\r\n                ");
  }

function program7(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "user-actions-menu", options) : helperMissing.call(depth0, "partial", "user-actions-menu", options))));
  data.buffer.push("\r\n                ");
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n            <div class=\"form-group\">\r\n                <label for=\"user-role\">Role</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-role-selector'] || (depth0 && depth0['gh-role-selector']),options={hash:{
    'initialValue': ("role"),
    'onChange': ("changeRole"),
    'selectId': ("user-role")
  },hashTypes:{'initialValue': "ID",'onChange': "STRING",'selectId': "STRING"},hashContexts:{'initialValue': depth0,'onChange': depth0,'selectId': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-role-selector", options))));
  data.buffer.push("\r\n                <p>What permissions should this user have?</p>\r\n            </div>\r\n            ");
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = '', helper, options;
  data.buffer.push("\r\n            <div class=\"form-group\">\r\n                <label for=\"user-password-old\">Old Password</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("user.password"),
    'type': ("password"),
    'id': ("user-password-old")
  },hashTypes:{'value': "ID",'type': "STRING",'id': "STRING"},hashContexts:{'value': depth0,'type': depth0,'id': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </div>\r\n            ");
  return buffer;
  }

  data.buffer.push("<header class=\"settings-subview-header\">\r\n    ");
  stack1 = helpers.unless.call(depth0, "session.user.isAuthor", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n    <h2 class=\"page-title\">");
  stack1 = helpers._triageMustache.call(depth0, "user.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</h2>\r\n    <section class=\"page-actions\">\r\n        ");
  stack1 = helpers['if'].call(depth0, "view.userActionsAreVisible", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n        <button class=\"btn btn-blue\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "save", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Save</button>\r\n    </section>\r\n</header>\r\n\r\n<div class=\"content settings-user\">\r\n\r\n    <figure class=\"user-cover\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'style': ("cover")
  },hashTypes:{'style': "ID"},hashContexts:{'style': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">\r\n        <button class=\"btn btn-default user-cover-edit js-modal-cover\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "user", "cover", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push(">Change Cover</button>\r\n    </figure>\r\n\r\n    <form class=\"user-profile\" novalidate=\"novalidate\" autocomplete=\"off\">\r\n\r\n        \r\n        <input style=\"display:none;\" type=\"text\" name=\"fakeusernameremembered\"/>\r\n        <input style=\"display:none;\" type=\"password\" name=\"fakepasswordremembered\"/>\r\n\r\n        <fieldset class=\"user-details-top\">\r\n\r\n            <figure class=\"user-image\">\r\n                <div id=\"user-image\" class=\"img\" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'style': ("image")
  },hashTypes:{'style': "ID"},hashContexts:{'style': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(" href=\"#\"><span class=\"hidden\">");
  stack1 = helpers._triageMustache.call(depth0, "name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\"s Picture</span></div>\r\n                <button type=\"button\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "openModal", "upload", "user", "image", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0,depth0,depth0],types:["STRING","STRING","ID","STRING"],data:data})));
  data.buffer.push(" class=\"edit-user-image js-modal-image\">Edit Picture</button>\r\n            </figure>\r\n\r\n            <div class=\"form-group first-form-group\">\r\n                <label for=\"user-name\">Full Name</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("user.name"),
    'id': ("user-name"),
    'class': ("user-name"),
    'placeholder': ("Full Name"),
    'autocorrect': ("off")
  },hashTypes:{'value': "ID",'id': "STRING",'class': "STRING",'placeholder': "STRING",'autocorrect': "STRING"},hashContexts:{'value': depth0,'id': depth0,'class': depth0,'placeholder': depth0,'autocorrect': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Use your real name so people can recognise you</p>\r\n            </div>\r\n\r\n        </fieldset>\r\n\r\n        <fieldset class=\"user-details-bottom\">\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"user-slug\">Slug</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-input'] || (depth0 && depth0['gh-input']),options={hash:{
    'class': ("user-name"),
    'id': ("user-slug"),
    'value': ("slugValue"),
    'name': ("user"),
    'focus-out': ("updateSlug"),
    'placeholder': ("Slug"),
    'selectOnClick': ("true"),
    'autocorrect': ("off")
  },hashTypes:{'class': "STRING",'id': "STRING",'value': "ID",'name': "STRING",'focus-out': "STRING",'placeholder': "STRING",'selectOnClick': "STRING",'autocorrect': "STRING"},hashContexts:{'class': depth0,'id': depth0,'value': depth0,'name': depth0,'focus-out': depth0,'placeholder': depth0,'selectOnClick': depth0,'autocorrect': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-input", options))));
  data.buffer.push("\r\n                <p>");
  stack1 = helpers._triageMustache.call(depth0, "gh-blog-url", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("/author/");
  stack1 = helpers._triageMustache.call(depth0, "slugValue", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("</p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"user-email\">Email</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("email"),
    'value': ("user.email"),
    'id': ("user-email"),
    'placeholder': ("Email Address"),
    'autocapitalize': ("off"),
    'autocorrect': ("off"),
    'autocomplete': ("off")
  },hashTypes:{'type': "STRING",'value': "ID",'id': "STRING",'placeholder': "STRING",'autocapitalize': "STRING",'autocorrect': "STRING",'autocomplete': "STRING"},hashContexts:{'type': depth0,'value': depth0,'id': depth0,'placeholder': depth0,'autocapitalize': depth0,'autocorrect': depth0,'autocomplete': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Used for notifications</p>\r\n            </div>\r\n            ");
  stack1 = helpers['if'].call(depth0, "view.rolesDropdownIsVisible", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(9, program9, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n            <div class=\"form-group\">\r\n                <label for=\"user-location\">Location</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("text"),
    'value': ("user.location"),
    'id': ("user-location")
  },hashTypes:{'type': "STRING",'value': "ID",'id': "STRING"},hashContexts:{'type': depth0,'value': depth0,'id': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Where in the world do you live?</p>\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"user-website\">Website</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("url"),
    'value': ("user.website"),
    'id': ("user-website"),
    'autocapitalize': ("off"),
    'autocorrect': ("off"),
    'autocomplete': ("off")
  },hashTypes:{'type': "STRING",'value': "ID",'id': "STRING",'autocapitalize': "STRING",'autocorrect': "STRING",'autocomplete': "STRING"},hashContexts:{'type': depth0,'value': depth0,'id': depth0,'autocapitalize': depth0,'autocorrect': depth0,'autocomplete': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Have a website or blog other than this one? Link it!</p>\r\n            </div>\r\n\r\n            <div class=\"form-group bio-container\">\r\n                <label for=\"user-bio\">Bio</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.textarea || (depth0 && depth0.textarea),options={hash:{
    'id': ("user-bio"),
    'value': ("user.bio")
  },hashTypes:{'id': "STRING",'value': "ID"},hashContexts:{'id': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "textarea", options))));
  data.buffer.push("\r\n                <p>\r\n                    Write about you, in 200 characters or less.\r\n                    ");
  data.buffer.push(escapeExpression((helper = helpers['gh-count-characters'] || (depth0 && depth0['gh-count-characters']),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "user.bio", options) : helperMissing.call(depth0, "gh-count-characters", "user.bio", options))));
  data.buffer.push("\r\n                </p>\r\n            </div>\r\n\r\n            <hr />\r\n\r\n        </fieldset>\r\n\r\n        <fieldset>\r\n            ");
  stack1 = helpers.unless.call(depth0, "view.isNotOwnProfile", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(11, program11, data),contexts:[depth0],types:["ID"],data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"user-password-new\">New Password</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("user.newPassword"),
    'type': ("password"),
    'id': ("user-password-new")
  },hashTypes:{'value': "ID",'type': "STRING",'id': "STRING"},hashContexts:{'value': depth0,'type': depth0,'id': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </div>\r\n\r\n            <div class=\"form-group\">\r\n                <label for=\"user-new-password-verification\">Verify Password</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'value': ("user.ne2Password"),
    'type': ("password"),
    'id': ("user-new-password-verification")
  },hashTypes:{'value': "ID",'type': "STRING",'id': "STRING"},hashContexts:{'value': depth0,'type': depth0,'id': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <button type=\"button\" class=\"btn btn-red button-change-password\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "password", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">Change Password</button>\r\n            </div>\r\n\r\n        </fieldset>\r\n\r\n    </form>\r\n\r\n</div>");
  return buffer;
  
}); });

define('ghost/templates/setup', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push("<section class=\"setup-box js-setup-box fade-in\">\r\n    <div class=\"vertical\">\r\n        <form id=\"setup\" class=\"setup-form\" method=\"post\" novalidate=\"novalidate\">\r\n\r\n            \r\n            <input style=\"display:none;\" type=\"text\" name=\"fakeusernameremembered\"/>\r\n            <input style=\"display:none;\" type=\"password\" name=\"fakepasswordremembered\"/>\r\n\r\n            <header>\r\n                <h1>Welcome to your new Ghost blog</h1>\r\n                <h2>Let's get a few things set up so you can get started.</h2>\r\n            </header>\r\n            <div class=\"form-group\">\r\n                <label for=\"blog-title\">Blog Title</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("text"),
    'name': ("blog-title"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("blogTitle")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>What would you like to call your blog?</p>\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <label for=\"name\">Full Name</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("text"),
    'name': ("name"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("name")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>The name that you will sign your posts with</p>\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <label for=\"email\">Email Address</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("email"),
    'name': ("email"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("email")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Used for important notifications</p>\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <label for=\"password\">Password</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("password"),
    'name': ("password"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("password")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Must be at least 8 characters</p>\r\n            </div>\r\n            <footer>\r\n                <button type=\"submit\" class=\"btn btn-green btn-lg\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "setup", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitting")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Ok, Let's Do This</button>\r\n            </footer>\r\n        </form>\r\n    </div>\r\n</section>");
  return buffer;
  
}); });

define('ghost/templates/signin', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', stack1, helper, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  
  data.buffer.push("Forgotten password?");
  }

  data.buffer.push("<section class=\"login-box js-login-box fade-in\">\r\n    <form id=\"login\" class=\"login-form\" method=\"post\" novalidate=\"novalidate\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "validateAndAuthenticate", {hash:{
    'on': ("submit")
  },hashTypes:{'on': "STRING"},hashContexts:{'on': depth0},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(">\r\n        <div class=\"email-wrap\">\r\n            <span class=\"input-icon icon-mail\">\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-trim-focus-input'] || (depth0 && depth0['gh-trim-focus-input']),options={hash:{
    'class': ("email"),
    'type': ("email"),
    'placeholder': ("Email Address"),
    'name': ("identification"),
    'autocapitalize': ("off"),
    'autocorrect': ("off"),
    'value': ("identification")
  },hashTypes:{'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'autocapitalize': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'autocapitalize': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-trim-focus-input", options))));
  data.buffer.push("\r\n            </span>\r\n        </div>\r\n        <div class=\"password-wrap\">\r\n            <span class=\"input-icon icon-lock\">\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'class': ("password"),
    'type': ("password"),
    'placeholder': ("Password"),
    'name': ("password"),
    'value': ("password")
  },hashTypes:{'class': "STRING",'type': "STRING",'placeholder': "STRING",'name': "STRING",'value': "ID"},hashContexts:{'class': depth0,'type': depth0,'placeholder': depth0,'name': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n            </span>\r\n        </div>\r\n        <button class=\"btn btn-blue\" type=\"submit\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "validateAndAuthenticate", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitting")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Log in</button>\r\n        <section class=\"meta\">\r\n            ");
  stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
    'class': ("forgotten-password")
  },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "forgotten", options) : helperMissing.call(depth0, "link-to", "forgotten", options));
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\r\n        </section>\r\n    </form>\r\n</section>\r\n");
  return buffer;
  
}); });

define('ghost/templates/signup', ['exports'], function(__exports__){ __exports__['default'] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Ember.Handlebars.helpers); data = data || {};
  var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  data.buffer.push("<section class=\"setup-box js-signup-box fade-in\">\r\n    <div class=\"vertical\">\r\n        <form id=\"signup\" class=\"setup-form\" method=\"post\" novalidate=\"novalidate\">\r\n\r\n            \r\n            <input style=\"display:none;\" type=\"text\" name=\"fakeusernameremembered\"/>\r\n            <input style=\"display:none;\" type=\"password\" name=\"fakepasswordremembered\"/>\r\n\r\n            <header>\r\n                <h1>Welcome to Ghost</h1>\r\n                <h2>Create your account to start publishing</h2>\r\n            </header>\r\n            <div class=\"form-group\">\r\n                <label for=\"email\">Email Address</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("email"),
    'name': ("email"),
    'autocorrect': ("off"),
    'value': ("email")
  },hashTypes:{'type': "STRING",'name': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Used for important notifications</p>\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <label for=\"name\">Full Name</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers['gh-trim-focus-input'] || (depth0 && depth0['gh-trim-focus-input']),options={hash:{
    'type': ("text"),
    'name': ("name"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("name")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "gh-trim-focus-input", options))));
  data.buffer.push("\r\n                <p>The name that you will sign your posts with</p>\r\n            </div>\r\n            <div class=\"form-group\">\r\n                <label for=\"password\">Password</label>\r\n                ");
  data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
    'type': ("password"),
    'name': ("password"),
    'autofocus': ("autofocus"),
    'autocorrect': ("off"),
    'value': ("password")
  },hashTypes:{'type': "STRING",'name': "STRING",'autofocus': "STRING",'autocorrect': "STRING",'value': "ID"},hashContexts:{'type': depth0,'name': depth0,'autofocus': depth0,'autocorrect': depth0,'value': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
  data.buffer.push("\r\n                <p>Must be at least 8 characters</p>\r\n            </div>\r\n            <footer>\r\n                <button type=\"submit\" class=\"btn btn-green btn-lg\" ");
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "signup", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
  data.buffer.push(" ");
  data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
    'disabled': ("submitting")
  },hashTypes:{'disabled': "ID"},hashContexts:{'disabled': depth0},contexts:[],types:[],data:data})));
  data.buffer.push(">Create Account</button>\r\n            </footer>\r\n        </form>\r\n    </div>\r\n</section>\r\n");
  return buffer;
  
}); });
// Loader to create the Ember.js application
/*global require */

if (!window.disableBoot) {
    window.App = require('ghost/app')['default'].create();
}

//# sourceMappingURL=ghost.js.map