'use strict';

var App = (function() {

  function App(config) {
    var defaults = {
      paletteCount: 6,
      svgGuidePath: 'svg/guides/'
    };
    this.opt = $.extend({}, defaults, config);
    this.init();
  }

  function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }

  function drawPixels(canvas, idxi8) {
    var idxi32 = new Uint32Array(idxi8.buffer);
    var ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.webkitImageSmoothingEnabled = ctx.msImageSmoothingEnabled = false;
    var imgd = ctx.createImageData(canvas.width, canvas.height);

    var buf32 = new Uint32Array(imgd.data.buffer);
    buf32.set(idxi32);

    ctx.putImageData(imgd, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]: [0, 0, 0];
  }

  function rgbToHex(rgb) {
    return "#" + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);
  }

  App.prototype.init = function(){
    this.loading = false;
    this.imgCanvas = $('#image-data')[0];
    this.$app = $('#app');
    this.loadSVGPatterns();
    this.loadListeners();
  };

  App.prototype.loadListeners = function(){
    var _this = this;

    $('form').on('submit', function(e){
      e.preventDefault();
    })

    $('.input-image').on('change', function(e){
      _this.onImageFileSelect(this);
    });

    $('.input-refresh').on('change', function(e){
      _this.refresh();
    });

    $('.color-group').on('change', '.input-color', function(e){
      _this.onChangePaletteColor();
    });
  };

  App.prototype.loadSVGPattern = function(pattern){
    var _this = this;
    var path = this.opt.svgGuidePath + pattern + '.svg';

    $.get(path, function(data) {
      _this.onSVGLoaded(pattern, data);
    });
  };

  App.prototype.loadSVGPatterns = function(){
    var _this = this;
    this.$svgContainer = $('#svg-templates');
    this.svgTemplates = {};

    $('.input-pattern').each(function(i){
      _this.loadSVGPattern($(this).val());
    });
  };

  App.prototype.onChangePaletteColor = function(){

  };

  App.prototype.onImageFileLoaded = function(src){
    // console.log('Loaded image src', src);
    var _this = this;
    var im = new Image();
    im.src = src;
    im.onload = function(e){
      _this.onImageLoaded(this);
    };
  };

  App.prototype.onImageFileSelect = function(input){
    if (this.loading) {
      console.log('In the process of loading...');
      return;
    }
    if (!input.files || !input.files[0]) {
      console.log('No valid input file');
      return;
    }

    this.setLoading(true);

    var _this = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      _this.onImageFileLoaded(e.target.result);
    };
    reader.readAsDataURL(input.files[0]);
  };

  App.prototype.onImageLoaded = function(im){
    var width = im.width;
    var height = im.height;
    console.log('Loaded image: ' + im.width + ' x ' + im.height);
    this.srcWidth = width;
    this.srcHeight = height;

    var canvas = this.imgCanvas;
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height);

    console.log('Quantizing...');
    this.quantizeImage();
  };

  App.prototype.onImageQuantized = function(imgData, palette){
    console.log('Done quantizing.');
    this.srcImgData = imgData;
    this.srcPalette = palette;

    this.updatePalette(palette);

    this.setLoading(false);
  };

  App.prototype.onSVGLoaded = function(pattern, svgData){
    var $dom = $(svgData);
    var $svg = $dom.find('svg').first();
    var patternData = {};

    this.$svgContainer.append($svg);
    patternData.$el = $svg;

    // retrieve viewbox
    var viewBox = $.map($svg.attr('viewBox').split(' '), function(value){ return parseFloat(value); });
    patternData.width = viewBox[2];
    patternData.height = viewBox[3];

    // retrieve pattern
    patternData.patternHtml = $svg.find('#main').prop('outerHTML');

    patternData.points = $svg.find('.number').map(function(){
      var $el = $(this);
      // retrieve x/y coordinate
      var transform = $el.attr('transform');
      transform = transform.split('(')[1];
      transform = transform.split(')')[0];
      transform = $.map(transform.split(' '), function(value){ return parseFloat(value); });
      var x = transform[0];
      var y = transform[1];
      var nx = x / patternData.width;
      var ny = y / patternData.height;
      var group = $el.attr('data-group') || 0;
      var groupIndex = parseInt(group) - 1;
      var restrictTo = $el.attr('data-only') || false;
      var $fillEl = $svg.find($el.attr('data-fill')).first();
      return {
        x: x,
        y: y,
        nx: nx,
        ny: ny,
        groupIndex: groupIndex,
        restrictTo: restrictTo,
        html: $el.prop('outerHTML'),
        fillShapeHtml: $fillEl.prop('outerHTML')
      }
    }).get();

    // console.log(patternData);
    this.svgTemplates[pattern] = patternData;

    console.log('Loaded '+ pattern + ' pattern');
  };

  App.prototype.quantizeImage = function(fixedPalette){
    var canvas = this.imgCanvas;
    fixedPalette = fixedPalette || [];
    var q = new RgbQuant({
      colors: this.opt.paletteCount,
      palette: fixedPalette
    });

    q.sample(canvas);
    var palette = q.palette(true);
    console.log('Palette: ', palette)
    var imgData = q.reduce(canvas);
    var newImageData = drawPixels(canvas, imgData);

    this.onImageQuantized(newImageData, palette);
  };

  App.prototype.refresh = function(){
    var colorCount = parseInt($('#input-color-count').val());
    var columnCount = parseInt($('#input-pattern-columns').val());
    var patternName = $('input[name="pattern"]').val();
  };

  App.prototype.setLoading = function(isLoading){
    this.loading = isLoading;

    if (isLoading){
      this.$app.attr('data-state', 'loading');
      $('.input').prop("disabled", true);

    } else {
      this.$app.attr('data-state', 'loaded');
      $('.input').prop("disabled", false);
    }

  };

  App.prototype.updatePalette = function(palette){
    var colorStrings = $.map(palette, function(rgb, i) {
      return rgbToHex(rgb);
    });

    var $colorGroup = $('.color-group');
    $colorGroup.empty();

    var html = '';
    $.each(colorStrings, function(i, str){
      html += '<input type="color" id="color'+i+'" name="color'+i+'" value="'+str+'" class="input input-color" data-index="'+i+'" />'
    });
    $colorGroup.html(html);
  };

  return App;

})();

$(function() {
  var app = new App({});
});
