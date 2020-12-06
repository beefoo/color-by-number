'use strict';

var App = (function() {

  function App(config) {
    var defaults = {
      svgGuidePath: 'svg/guides/'
    };
    this.opt = $.extend({}, defaults, config);
    this.init();
  }

  function clamp(val, min, max) {
    min = min || 0;
    max = max || 1;
    return val > max ? max : val < min ? min : val;
  }

  function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }

  function distanceVector(x1, y1, z1, x2, y2, z2){
    var dx = x1 - x2;
    var dy = y1 - y2;
    var dz = z1 - z2;
    return Math.sqrt( dx * dx + dy * dy + dz * dz );
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
  }

  function getPaletteColor(nx, ny, pixels, w, h, palette) {
    var x = Math.round(nx * (w-1));
    var y = Math.round(ny * (h-1));
    var index = parseInt(y * w * 4 + x * 4);
    var r = pixels[index];
    var g = pixels[index+1];
    var b = pixels[index+2];
    var closestIndex = 0;
    var closestDistance = -1;
    for (var i=0; i<palette.length; i++){
      var rgb = palette[i];
      // exact match, we're done
      if (rgb[0]===r && rgb[1]===g && rgb[2]===b){
        closestIndex = i;
        closestDistance = 0;
        break;
      } else if (i===0) {
        closestDistance = distanceVector(r, g, b, rgb[0], rgb[1], rgb[2]);
      } else {
        var pDistance = distanceVector(r, g, b, rgb[0], rgb[1], rgb[2]);
        if (pDistance < closestDistance){
          closestIndex = i;
          closestDistance = pDistance;
        }
      }
    }
    return closestIndex;
  }

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
    this.$svgContainer = $('#svg-container');
    this.$svg = $('#output-pattern');
    this.colorCount = parseInt($('#input-color-count').val());
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

    $('input[type="range"]').on('input', function(e){
      var $el = $(this);
      var value = $el.val();
      $($el.attr('data-update')).text(value);
    });

    $('.input-refresh').on('change', function(e){
      console.log('Refreshing...');
      if (_this.loading) {
        console.log('In the process of loading...');
        return;
      }
      _this.setLoading(true);
      setTimeout(function(){
        _this.refresh();
      }, 10);
    });

    $('.color-group').on('change', '.input-color', function(e){
      _this.setLoading(true);
      setTimeout(function(){
        _this.onChangePaletteColor();
      }, 10);
    });

    $('input[name="display"]').on('change', function(e){
      _this.updateDisplayLayers();
    });

    $('input[name="zoom"]').on('input', function(e){
      _this.zoom(parseFloat($(this).val()));
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
    this.$svgTemplates = $('#svg-templates');
    this.svgTemplates = {};

    $('.input-pattern').each(function(i){
      _this.loadSVGPattern($(this).val());
    });
  };

  App.prototype.onChangePaletteColor = function(){
    var colors = $('.input-color').map(function(){
      return [hexToRgb($(this).val())];
    }).get();
    this.srcPalette = colors;
    this.onImageLoaded(this.sourceImage);
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
    this.sourceImage = im;
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

    this.refresh();
  };

  App.prototype.onSVGLoaded = function(pattern, svgData){
    var $dom = $(svgData);
    var $svg = $dom.find('svg').first();
    var patternData = {};

    this.$svgTemplates.append($svg);
    patternData.$el = $svg;

    // retrieve viewbox
    var viewBox = $.map($svg.attr('viewBox').split(' '), function(value){ return parseFloat(value); });
    patternData.width = viewBox[2];
    patternData.height = viewBox[3];

    // retrieve pattern
    var $mainPattern = $svg.find('#main').first();
    $mainPattern.find('.pattern').attr('fill', 'black').css('fill', 'black');
    patternData.patternHtml = $mainPattern.prop('outerHTML');

    patternData.points = $svg.find('.number').map(function(){
      var $el = $(this);
      // retrieve x/y coordinate
      var transform = $el.attr('transform');
      transform = transform.split('(')[1];
      transform = transform.split(')')[0];
      transform = $.map(transform.split(' '), function(value){ return parseFloat(value); });
      var x = parseFloat($el.attr('data-x'));
      var y = parseFloat($el.attr('data-y'));
      var tx = transform[0];
      var ty = transform[1];
      var group = $el.attr('data-group') || 0;
      var groupIndex = parseInt(group) - 1;
      var restrictTo = $el.attr('data-only') || false;
      var $fillEl = $svg.find($el.attr('data-fill')).first();
      return {
        x: x,
        y: y,
        tx: tx,
        ty: ty,
        groupIndex: groupIndex,
        restrictTo: restrictTo,
        html: $el.prop('outerHTML'),
        fillShapeId: $el.attr('data-fill'),
        fillShapeHtml: $fillEl.prop('outerHTML')
      }
    }).get();

    // console.log(patternData);
    this.svgTemplates[pattern] = patternData;

    console.log('Loaded '+ pattern + ' pattern');
  };

  App.prototype.quantizeImage = function(fixedPalette){
    var canvas = this.imgCanvas;
    fixedPalette = fixedPalette || this.srcPalette || [];
    var q = new RgbQuant({
      colors: this.colorCount,
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

    // new color count, re-quantize!
    if (this.colorCount !== colorCount) {
      console.log('Color count change, re-quantizing...');
      this.colorCount = colorCount;
      this.srcPalette = [];
      this.onImageLoaded(this.sourceImage);
      return;
    }

    // console.log(colorCount, columnCount, patternName);
    if (!this.svgTemplates[patternName]){
      console.log('SVG data not yet loaded for '+patternName);
      return;
    }
    var $svgContainer = this.$svgContainer;
    var $svg = this.$svg;
    var pat = this.svgTemplates[patternName];
    var aspectRatio = this.srcWidth / this.srcHeight;
    var outWidth = pat.width * columnCount;
    var outHeight = outWidth / aspectRatio;
    var rowCount = Math.floor(outHeight / pat.height);
    outHeight = pat.height * rowCount;

    $svg.attr('width', outWidth);
    $svg.attr('height', outHeight);
    $svg.attr('viewBox', '0 0 '+outWidth+' '+outHeight)
    $svg.empty();

    // scale and translate svg
    var containerW = $svgContainer.width();
    var containerH = $svgContainer.height();
    var scaleX = containerW / outWidth;
    var scaleY = containerH / outHeight;
    var scale = Math.min(scaleX, scaleY);
    if (scale < 1){
      var translateX = 0;
      var scaledW = outWidth * scale;
      if (scaledW < containerW) translateX = (containerW-scaledW) * 0.5;
      $svg.css('transform', 'translate3D('+translateX+'px, 0, 0) scale3D('+scale+', '+scale+', 1)');
    }

    var html = '';
    // add definitions
    html += '<defs>';
      // add main pattern
      html += pat.patternHtml;
      // add shape patterns
      $.each(pat.points, function(i, p){
        html += p.fillShapeHtml;
      });
    html += '</defs>';

    // bg
    html += '<rect x="0" y="0" width="'+outWidth+'" height="'+outHeight+'" fill="white"/>';

    // // add color shapes
    // html += '<g id="colors">';
    // html += '</g>';

    var cHtml = '<g id="colors">';
    var pHtml = '<g id="lines">';
    var nHtml = '<g id="numbers">';

    // // add numbers
    // html += '<g id="numbers">';
    var palette = this.srcPalette;
    var pixels = this.srcImgData.data;
    var srcWidth = this.srcImgData.width;
    var srcHeight = this.srcImgData.height;
    for (var row=0; row<rowCount; row++) {
      for (var col=0; col<columnCount; col++) {
        var x = col * pat.width;
        var y = row * pat.height;
        // add shapes for color
        $.each(pat.points, function(i, p){
          var pX = p.x + x;
          var pY = p.y + y;
          var nx = clamp(pX / outWidth);
          var ny = clamp(pY / outHeight);
          var pIndex = getPaletteColor(nx, ny, pixels, srcWidth, srcHeight, palette);
          var fillColor = rgbToHex(palette[pIndex]);
          cHtml += '<use xlink:href="'+p.fillShapeId+'" transform="translate('+x+','+y+')" fill="'+fillColor+'"/>';
          if (p.restrictTo !== false){
            var tX = p.tx + x;
            var tY = p.ty + y;
            nHtml += '<text transform="translate('+tX+' '+tY+')" style="font-size: 12px">'+(pIndex+1)+'</text>'
          }
        });
        // add main pattern
        pHtml += '<use xlink:href="#main" transform="translate('+x+','+y+')"/>';
        // add text
      }
    }
    // html += '</g>';

    cHtml += '</g>';
    pHtml += '</g>';
    nHtml += '</g>';

    // add colors
    html += cHtml;
    // add main pattern
    html += pHtml;
    // add numbers
    html += nHtml;

    $svg.html(html);
    this.updateDisplayLayers();

    this.setLoading(false);
  };

  App.prototype.setLoading = function(isLoading){
    this.loading = isLoading;

    if (isLoading){
      this.$app.removeClass('loaded-state start-state').addClass('loading-state');
      $('.input').prop("disabled", true);

    } else {
      this.$app.removeClass('loading-state start-state').addClass('loaded-state');
      $('.input').prop("disabled", false);
    }

  };

  App.prototype.updateDisplayLayers = function(){
    var $svg = this.$svg;

    $('input[name="display"]').each(function(){
      var $el = $(this);
      var value = $el.val();
      if ($el.is(':checked')){
        $svg.find('#'+value).css('display', '');
      } else {
        $svg.find('#'+value).css('display', 'none');
      }
    });
  };

  App.prototype.updatePalette = function(palette){
    var colorStrings = $.map(palette, function(rgb, i) {
      return rgbToHex(rgb);
    });
    this.colorHexs = colorStrings;

    var $colorGroup = $('.color-group');
    $colorGroup.empty();

    var html = '';
    $.each(colorStrings, function(i, str){
      html += '<input type="color" id="color'+i+'" name="color'+i+'" value="'+str+'" class="input input-color" data-index="'+i+'" />'
    });
    $colorGroup.html(html);
  };

  App.prototype.zoom = function(scale){
    this.$svgContainer.css('transform', 'scale3D('+scale+', '+scale+', 1)');
  };

  return App;

})();

$(function() {
  var app = new App({});
});
