/*
 *  Fetch data from given url and invoke callback and appropriate parser if configured 
 */

var DataFetch = {
  /*
   * 
   * @param {type} ds
   * @param {type} callback
   * @returns {undefined}
   */
  get: function(ds, callback) {
    if(ds) {
      $.ajax({
        url: ds.dataUrl,
        data: ds.params,
        success: function( data ) {
          var parser = ds.parser;
          if ( parser ) {
            callback(Parser[parser](JSON.parse(data), "value"));
          } else {
            callback(data);
          }
        }
      });
    }
  }, 
 /*
   * 
   * @param {widget-descriptor} ds :: Renderer.page_meta.descriptors[i] widget descriptor. 
   * @param {function} callback :: Renderer.widget.renderData to render the data fetch.
   * @param {function} parser :: Parser.fn to parse the data fetched.
   * @returns {}
   */
  getMultiple: function(ds, callback, parser) {
    if(ds) {
      var batchRequests = [],
          datasourceId;
      for (datasourceId = 0; datasourceId <  ds.datasources.length; datasourceId++) {
        batchRequests.push($.ajax({
          url: ds.datasources[datasourceId].dataUrl,
          data: ds.datasources[datasourceId].params
        }));
      }
      $.when.apply($, batchRequests).done(function() {
        var parser = ds.parser;
          if ( parser ) {
            callback(Parser[parser](arguments));
          }
      });
    }
  }
};


/*
 *  Responses of different formats are parsed by the Parser object
 *  Implement a custom parser function as member functions of Parser
 *  The parser field of the widget descriptor should be the parser function name to be utilized to parse the response
 */

var Parser = {
  /*
   * 
   * @param {DataFetch response} data
   * @param {String} seriesNm 
   * @returns {Array|Parser.hornby.values}
   */
  hornby: function(data, seriesNm) {
    var values = []
    var dt = new Date(data.start * 1000);
    var steps = (data.end - data.start) / data.step;
    for (var i = 0; i < steps; i++) {
      var element = {}
      element.time =  Parser.getFormattedTime(dt);
      element[seriesNm] = Parser.bytesConverter(data.data[i], "kb", "kb");
      values.push(element);
      dt.setMinutes(dt.getMinutes() + Math.round(data.step/60));
    }
    
    return values;
  },
  hornby_discrete: function(data) {
    if (data.data > 100) {
      data.data /= 100;
    }
    return {"max":100, "progress": data.data};
  },
  monitor: function(data) {
    var values = []
  
    for (var i = 0; i < data.length; i++) {
      var element = {}
      var dt = new Date(data[i][0]);
      element.time =  Parser.getFormattedTime(dt);
      element["value"] = Math.round(data[i][1]);
      values.push(element);
    }

    return values;
  },
  stats: function(data) {
    var tableData = [
      {"time": "Last Week"},
      {"time": "Last Month"},
      {"time": "All Time"}
    ];

    var i = 0;
    var entries = [];

    for (var i in data) {
      entries.push(data[i]);
    }

    for (var i=0; i < 3; i++) {
      tableData[i] = {time: tableData[i].time, a: entries[i], b: entries[i+3], c: entries[i+6], d: entries[i+9], e: entries[i+12], f: entries[i+15]};
    }
    
    return tableData;
  },
  urlData: function(data) {
    var dataValues = [];
    for (var key in data) {
      if(data[key].length > 5) {
        data[key] += " bytes";
      }
      dataValues.push({a: key, b: Parser.numberWithCommas(data[key])});
    }
    return dataValues;
  },
  registrationsData: function(d) {
    var filler = [{
      "item": "SDB",
      "description": "sdb.cns.iu.edu",
      "value": "",
      "deltaType": "",
      "delta": "",
      "period": ""
    },{
      "item": "Sci2 Tool",
      "description": "sci2.cns.iu.edu",
      "value": "",
      "deltaType": "",
      "delta": "",
      "period": ""
    }];
    
    var record;
    for (record in filler) {
      filler[record].value = Parser.numberWithCommas(JSON.parse((d[record][0]).replace(/ /g,''))[0]);
    }
    
    return filler;
  },
  merge: function() {},
  padDigit: function(digit) {
    return ("" + digit).length === 1 ? "0" + digit : digit;
  },
  getFormattedTime: function(dt) {
    return "" + dt.getFullYear() + this.padDigit(dt.getMonth()) + this.padDigit(dt.getDate()) + "-" + this.padDigit(dt.getHours()+1) + this.padDigit(dt.getMinutes());
  },
  numberWithCommas: function(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  },
  bytesConverter:  function(num, inUnit, outUnit) {
    var conversionMatrix = {
      kb: {
        mb: 1/1024,
        gb: 1/1024*1024,
        kb: 1
      },
      mb: {
        kb: 1024,
        gb: 1/1024,
        mb: 1
      },
      gb: {
        kb: 1024 * 1024,
        mb: 1024,
        gb: 1
      }
    };
    
    var result = num * conversionMatrix[inUnit][outUnit];
    return result;
  }
};


/*
 *  Renderer.widgets ::
 *    Render Widgets and Layout from page meta
 *    Implement a custom widget function as member functions of Renderer
 *    The type field of the widget descriptor should be the function name to be utilized to render the widget
 * 
 *  Renderer.page_meta ::
 *    reference to the current page metadata
 *  
 *  Renderer.templates ::
 *    reference to all templates used for layout and widget components which utilize them
 *  
 *  Renderer.chartComponents ::
 *    All common chart componentes like axis, base svg, legends, filter, etc
 *  
 *  Renderer.initialize ::
 *    Render page from meta, register events and compile templates
 *  
 *  Renderer.reset ::
 *    Clean display area
 */

var Renderer = {
  page_meta: {},
  templates: {},
  widgets: {
    ComponentBar: function(ds) {
      //clear chart holder
      var widgetHolder = d3.select("#" + ds.id + "Content"),
          width = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height = ds.thickness,
          widgetSVG = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin);
      
      function renderData(data) {
        var d0 = 0;
        data[0].delta = 0;
        for(var index = 1; index < data.length; index++) {
            d0 += data[index-1][ds.series.metricColumn];
            data[index].delta = d0;
        }
        
        var x = d3.scale.linear()
                        .domain([0, ds.data.reduce(function(previousValue, currentValue) {
                                      return previousValue + currentValue[ds.series.metricColumn];
                                    }, 0)
                                ])
                        .rangeRound([0, width]);
        var colorScale   = d3.scale.ordinal()
                                   .domain(data.map(function(d) { return d[ds.series.categoryColumn];}))
                                   .range(ds.seriesColors);
        var percentScale = d3.scale.linear()
                                   .domain([0, data[data.length - 1].delta + data[data.length - 1][ds.series.metricColumn]])
                                   .range([0, 100]);

        widgetSVG.selectAll("rect")
                 .data(data)
                 .enter()
                 .append("rect")
                 .attr("width", function(d) { return x(d[ds.series.metricColumn]); })
                 .attr("height", ds.thickness)
                 .attr("fill", function(d) {return colorScale(d[ds.series.categoryColumn]); })
                 .attr("x", function(d) {return x(d.delta); });
        
        widgetHolder.html(widgetHolder.html() + Renderer.templates.componentBarTableTemplate({
          columns: data.map(function(d) {
            return {
              color: colorScale(d[ds.series.categoryColumn]),
              label: d[ds.series.categoryColumn], 
              value:   d[ds.series.metricColumn],
              percent: Math.round(percentScale(d[ds.series.metricColumn])) + "% "
            };
          })
        }));
      }
      
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Bar: function(ds) {
      //clear chart holder
      var widgetHolder = d3.select("#" + ds.id + "Content"),
          width      = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height     = (parseInt(ds.height) | parseInt(widgetHolder.style("height"))) - (ds.margin.top + ds.margin.bottom),
          x          = d3.scale.ordinal()
                               .rangeRoundBands([0, width], 0.2),
          y          = d3.scale.linear()
                               .range([height, 0]),
          colorScale = d3.scale.ordinal()
                         .range(ds.seriesColors),                               
          widgetSVG  = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin);

      function renderData(data) {
        x.domain(data.map(function(d) { return d[ds.series[0].categoryColumn]; }));
        y.domain([0, d3.max(data, function(d) { return d[ds.series[0].metricColumn]; })]);
        
        var LegendLabels = [];
        for (var index = 0; index < ds.series.length; index++) {
          LegendLabels.push({label: ds.series[index].name, text: ds.series[index].name});
        }
        
        widgetSVG.selectAll(".bar")
            .data(data)
            .enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", function(d) { return x(d[ds.series[0].categoryColumn]); })
            .attr("width", x.rangeBand())
            .attr("y", function(d) { return y(d[ds.series[0].metricColumn]); })
            .attr("height", function(d) { return height - y(d[ds.series[0].metricColumn]); })
            .attr("fill", colorScale(ds.series[0].name));
    
        Renderer.chartComponents.Axis(widgetSVG, "categoryAxis", ds.axes.categoryAxis, x, width, height);
        Renderer.chartComponents.Axis(widgetSVG, "metricAxis", ds.axes.metricAxis, y, width, height);
        Renderer.chartComponents.Legend(widgetSVG, LegendLabels, colorScale, width, 0);
      }
           
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Column: function(ds) {
      //clear chart holder
      var widgetHolder = d3.select("#" + ds.id + "Content").style("height", ds.height + "px"),
          width      = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height     = parseInt(widgetHolder.style("height")) - (ds.margin.top + ds.margin.bottom),
          x          = d3.scale.linear()
                               .range([0, width]),
          y          = d3.scale.ordinal()
                               .rangeRoundBands([0, height], 0.1),
          colorScale = d3.scale.ordinal()
                         .range(ds.seriesColors),                               
          widgetSVG  = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin);

      function renderData(data) {
        x.domain( [0, d3.max(data, function(d) { return d[ds.series[0].metricColumn]; })]);
        y.domain(data.map(function(d) { return d[ds.series[0].categoryColumn]}));
        
        var LegendLabels = [];
        for (var index = 0; index < ds.series.length; index++) {
          LegendLabels.push({label: ds.series[index].name, text: ds.series[index].name});
        }
        
        widgetSVG.selectAll(".bar")
            .data(data)
            .enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", function(d) { return height - y(d[ds.series[0].categoryColumn]); })
            .attr("width", function(d) { return y.rangeBand(); })
            .attr("y", function(d) { return 0; })
            .attr("height", function(d) { return x(d[ds.series[0].metricColumn]); })
            .attr("fill", colorScale(ds.series[0].name))
            .attr("transform", "rotate(-90) translate(" + -(height + y.rangeBand()) + ", 0)")
   
        Renderer.chartComponents.Axis(widgetSVG, "categoryAxis", ds.axes.categoryAxis, y, width, height);
        Renderer.chartComponents.Axis(widgetSVG, "metricAxis", ds.axes.metricAxis, x, width, height);
        Renderer.chartComponents.Legend(widgetSVG, LegendLabels, colorScale, width, 0);
      }
           
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Line: function(ds) {
      var widgetHolder = d3.select("#" + ds.id + "Content"),
          width      = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height     = parseInt(widgetHolder.style("height")) - (ds.margin.top + ds.margin.bottom),
          height     = ds.hasFilter ? height - 32 : height,
          x          = d3.time.scale()
                              .range([0, width]),
          y          = d3.scale.linear()
                               .range([height, 0]),
          colorScale = d3.scale.ordinal()
                               .range(ds.seriesColors)
                               .domain(ds.series.metricColumns),                               
          line       = d3.svg.line()
                             .interpolate("linear")
                             .x(function(d) { return x(d[ds.series.categoryColumn]); })
                             .y(function(d) { return y(d.value); }),
          widgetSVG = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin);
  
      if (ds.hasFilter) {
        $("#" + ds.id + "Content").prepend(Renderer.chartComponents.Filter({id: ds.id}));
        $("#" + ds.id + "Content " + ".filter-bar button[value=" + ds.datasources[ds.datasourceId].params.starttime + "]").addClass("selected");
      }
    
      function renderData(data) {
        //Pre-process data for line chart.
        data.forEach(function(d) {
          d.time = d3.time.format(ds.series.categoryColumnFormat).parse("" + d[ds.series.categoryColumn]);
        });
        var lines = colorScale.domain()
                              .map(function(name) {
                                return {
                                  name: name,
                                  values: data.map(function(d) { return {time: d[ds.series.categoryColumn], value: Math.round(d[name])}; })
                                };
                              });
        
        //Extract series names for legend construction
        var LegendLabels = [];
        for (var index = 0; index < ds.series.metricColumns.length; index++) {
          LegendLabels.push({label: ds.series.metricColumns[index], text: ds.series.metricColumnNames[index]});
        }
        
        x.domain(d3.extent(data, function(d) { return d[ds.series.categoryColumn]; }));
        var yDomain = d3.max(lines, function(c) { return d3.max(c.values, function(v) { return v.value; }); });
        y.domain([0, yDomain]);

        widgetSVG.selectAll(".linears")
                 .data(lines)
                 .enter()
                 .append("g")
                 .append("path")
                 .attr("class", "line")
                 .attr("d", function(d) {
                    return line(d.values); 
                  })
                 .style("stroke", function(d) { return colorScale(d.name); });
         
        var focus = widgetSVG.append("g")
                             .attr("class", "focus")
                             .style("display", "none");

        focus.append("circle")
             .attr("r", 2.5)

        focus.append("text")
             .attr("x", 9)
             .attr("dy", ".35em");

        var bisectDate = d3.bisector(function(d) { return d.time; }).left;
        
        widgetSVG.append("rect")
                 .attr("class", "overlay")
                 .attr("width", width)
                 .attr("height", height)
                 .on("mouseover", function() { focus.style("display", null); })
                 .on("mouseout", function() { focus.style("display", "none"); })
                 .on("mousemove", mousemove);

        function mousemove() {
          var x0 = x.invert(d3.mouse(this)[0]),
              i = bisectDate(data, x0, 1),
              d0 = data[i - 1],
              d1 = data[i],
              d = x0 - d0.time > d1.time - x0 ? d1 : d0;

          focus.attr("transform", "translate(" + x(d.time) + "," + y(d.value) + ")");
          focus.select("text").text(Parser.numberWithCommas(d.value));
        }

        Renderer.chartComponents.Axis(widgetSVG, "categoryAxis", ds.axes.categoryAxis, x, width, height);
        Renderer.chartComponents.Axis(widgetSVG, "metricAxis", ds.axes.metricAxis, y, width, height);
        Renderer.chartComponents.Legend(widgetSVG, LegendLabels, colorScale, width, 0);
      };
      
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Table: function(ds) {
      var widgetHolder = d3.select("#" + ds.id + "Content");

      function renderData(data) {
        widgetHolder.html(Renderer.templates.tableWidgetTemplate({columnTitles: ds.columnTitles, data: data}));
      }
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Badge: function(ds) {
      function renderData(d) {
        var widgetHolder = d3.select("#" + ds.id + "Content");
        widgetHolder.html(Renderer.templates.badgeTemplate({id: ds.id, data: d}));
      }
      
      DataFetch.getMultiple(ds, renderData, "registrationsData"); 
    },
    Progress: function(ds) {
      
      var widgetHolder = d3.select("#" + ds.id + "Content"),
          width      = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height     = parseInt(widgetHolder.style("height")) - (ds.margin.top + ds.margin.bottom),
          dimension  = d3.min([width, height]),
          widgetSVG  = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin);
  
      var arc = d3.svg.arc()
                  .innerRadius(dimension / 2 - 30)
                  .outerRadius(dimension / 2 - 20)
                  .startAngle(0);

      widgetSVG.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
      
      function renderData(data) {
        widgetSVG.append("text")
                 .attr("x", 2)
                 .attr("y", 8)
                 .text(data.progress + "%")
                 .attr("class", "progress-label")
                 .attr("text-anchor", "middle");

        widgetSVG.append("path")
                 .datum({endAngle: (ds.scale / 180) * Math.PI})
                 .style("fill", "#ddd")
                 .attr("d", arc);

        widgetSVG.append("path")
                 .datum({endAngle: (data.progress / 100) * (ds.scale / 180) * Math.PI})
                 .style("fill", ds.seriesColor)
                 .attr("d", arc);
      }
      
      DataFetch.get(ds.datasources[ds.datasourceId], renderData); 
    },
    Map: function(ds) {
      var widgetHolder = d3.select("#" + ds.id + "Content"),
          width = parseInt(widgetHolder.style("width")) - (ds.margin.left + ds.margin.right),
          height = (parseInt(ds.height) | parseInt(widgetHolder.style("height"))) - (ds.margin.top + ds.margin.bottom),
          widgetSVG = Renderer.chartComponents.SVG(widgetHolder, width, height, ds.margin),
          centered,
          scale0 = (width - 1) / 2 / Math.PI,
          projection = d3.geo.equirectangular()
                         .scale(ds.scale)
                         .center(ds.center),
          path = d3.geo.path()
                   .projection(projection),
          zoom = d3.behavior.zoom()
                   .translate([width / 2, height / 3])
                   .scale(scale0)
                   .scaleExtent([scale0, 8 * scale0])
                   .on("zoom", zoomed);

      widgetSVG.call(zoom)
               .call(zoom.event);

      function renderData(topology) {
        widgetSVG.selectAll("path")
                 .data(topojson.object(topology, topology.objects.countries).geometries)
                 .enter()
                 .append("path")
                 .attr("class", "geo-path")
                 .attr("d", path)
                 .on("click", clicked);

        addPins([{lat: 29.01, lon: 77.38}, {lat: 74.0059, lon: 40.7127}]); 
      }

      function clicked(d) {
        var x, y, k;

        if (d && centered !== d) {
          var centroid = path.centroid(d);
          x = centroid[0];
          y = centroid[1];
          k = 2;
          centered = d;
        } else {
          x = width / 2;
          y = height / 2;
          k = 1;
          centered = null;
        }

        widgetSVG.selectAll("path")
                 .classed("active", centered && function(d) { return d === centered; });

        widgetSVG.transition()
                 .duration(750)
                 .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")")
                 .style("stroke-width", 1.5 / k + "px");
      }

      function addPins(data) {        
        widgetSVG.selectAll("circle")
                 .data(data)
                 .enter()
                 .append("circle")
                 .attr("cx", function(d) {
                   return projection([d.lon, d.lat])[0];
                 })
                 .attr("cy", function(d) {
                   return projection([d.lon, d.lat])[1];
                 })
                 .attr("r", 3)
                 .style("fill", "Orange");
      }

      function zoomed() {
        projection.translate(zoom.translate())
                  .scale(zoom.scale());

        widgetSVG.selectAll("path")
                 .attr("d", path);

        widgetSVG.selectAll("circle")
                 .attr("cx", function(d) {
                   return projection([d.lon, d.lat])[0];
                 })
                 .attr("cy", function(d) {
                   return projection([d.lon, d.lat])[1];
                 });
      }
      
      DataFetch.get(ds.datasources[ds.datasourceId], renderData);
    }
  },
  chartComponents: {
    SVG: function(widgetHolder, width, height, margin) {
      widgetHolder.selectAll("*").remove();
      var widgetSVG = widgetHolder.append("svg")
                                  .attr("width", width + margin.left + margin.right)
                                  .attr("height", height + margin.top + margin.bottom - 5)
                                  .append("g")
                                  .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
      
      return widgetSVG;
    },
    Legend: function(chart, legendData, colorScale, x, y){
      if (legendData.length <= 1) {
        return;
      }
      
      var legendMargin = 20;
      var legend = chart.append("g")
                        .attr("transform", "translate(" + x + "," + (y + legendMargin) +")") 
                        .selectAll(".legend")
                        .data(legendData)
                        .enter()
                        .append("g")
                        .attr("class", "legend")
                        .attr("transform", function(d, i) { return "translate(0," + i * 22 + ")"; });

      legend.append("circle")
            .attr("cx", 8)
            .attr("cy", 8)
            .attr("r", 9)
            .style("fill", function(d) {return colorScale(d.label); } );

      legend.append("text")
            .attr("y", 8)
            .attr("dy", ".4em")
            .attr("dx", 25)
            .style("text-anchor", "start")
            .text(function(d) { return d.text; });
    },
    Axis: function(chart, axisType, axisDs, axisFn, width, height, format) {
      var axisObj = d3.svg.axis()
                    .scale(axisFn)
                    .orient(axisDs.orientation)
                    .outerTickSize(0);
      
      if(axisDs.format) axisObj.tickFormat(d3.time.format(axisDs.format));
      
      chart.append("g")
               .attr("class", axisType)
               .call(axisObj)
               .selectAll("text")	
               .style("text-anchor", "end")
               .attr("dx", "-.8em")
               .attr("dy", ".15em")
               .attr("transform", function(d) {
                 return "rotate(" + axisDs.tickLabelAngle + ")" ;
               });

      if ( axisDs.orientation === "bottom" ) {
        chart.select("." + axisType)
             .attr("transform", "translate(0," + height + ")")
             .append("text")
             .attr("x", width / 2)
             .attr("dy", axisDs.axisLabelDistance)
             .style("text-anchor", "middle")
             .text(axisDs.axisLabel);
      } else {
        axisObj.ticks(10);
        
        chart.select("." + axisType)
             .append("text")
             .attr("x", -height / 2)
             .attr("dy", axisDs.axisLabelDistance)
             .style("text-anchor", "middle")
             .text(axisDs.axisLabel)
             .attr("transform", "rotate(-90)");
      }
    },
    Filter: function(ds) {
      return Renderer.templates.filterBarTemplate(ds);
    },
    Clean: function(widgetId) {
      d3.select("#" + widgetId).html("");
    }
  },
  initialize: function(pg) {
    this.page_meta = pg;
    
    //compile templates
    this.templates.sectionCardTemplate = Handlebars.compile($("#section-card-template").html());
    this.templates.cardContentTemplate = Handlebars.compile($("#card-content-template").html());
    this.templates.pageSectionsTemplate = Handlebars.compile($("#page-sections-template").html());
    this.templates.componentBarTableTemplate = Handlebars.compile($("#componentBarTable-template").html());
    this.templates.tableWidgetTemplate = Handlebars.compile($("#tableWidget-template").html());
    this.templates.badgeTemplate = Handlebars.compile($("#badge-template").html());
    this.templates.filterBarTemplate = Handlebars.compile($("#filterBar-template").html());
    Handlebars.registerHelper("rowGenerator", function(context, options) {
      var row = "<tr>";
      for(var key in context) {
        row += "<td>" + context[key] + "</td>";
      }
      return row + "</tr>";
    });
    Handlebars.registerHelper("sectionCardHelper", function(context, options) {
      var container = $("#" + context.id);
      if ( container.length === 0 ) {
        return '<div id="' + context.id + '" class="section-card" draggable="true">' + Renderer.templates.cardContentTemplate(context) + '<div>'
      } else {
        return Renderer.templates.cardContentTemplate(context);
      }
    });
    
    //rendering page layout components
    //render columns
    var sortableColList = [];
    for (var cIndex in pg.layout.columns) {
      $("#displayArea").append(this.templates.pageSectionsTemplate(pg.layout.columns[cIndex]));
      sortableColList.push('#' + (pg.layout.columns[cIndex].id));
    }

    //render sections within columns
    //plot widgets
    for(var wIndex in pg.descriptors) {
      var ds = pg.descriptors[wIndex];
      var titleText = "";
      if (ds.datasources[ds.datasourceId] !== undefined) {
        titleText = ": " + ds.datasources[ds.datasourceId].name;
        $(ds.parent).append(
          this.templates.sectionCardTemplate({
            id : ds.id,
            title: ds.title + titleText,
            descId: wIndex, 
            description: ds.datasources[ds.datasourceId].description,
            datasources: ds.datasources
          })
        );
      } else {
        $(ds.parent).append(
          this.templates.sectionCardTemplate({
            id : ds.id,
            title: ds.title + titleText,
            descId: wIndex,
            description: ds.description,
            datasources: ds.datasources
          })
        );
      }
      (Renderer.widgets[ds.type])(ds);
    }

    //register event handlers
    $(".title-text").on("click", EventHandlers.cardEffectEvent);
    $(".section-card .dropdown").on("click", "li", EventHandlers.dropdownEvent);
    $("#displayArea").on("click", ".filter-bar button", EventHandlers.timeFilterEvent);
    EventHandlers.popOverEvent('[data-toggle="popover"]');
    EventHandlers.maximizeEvent('.glyphicon-resize-full'); 
    
    var draggedDes = 0;
    $(".section-card").on("dragend", function(){
      var self = this;
      draggedDes = (Renderer.page_meta.descriptors.filter(function(elem) { if(elem.id === self.id) return true;}))[0];
    });   
    $(sortableColList.toString()).sortable({
      connectWith: '.connected',
      items: ':not(.disabled)'
    }).bind('sortupdate', function(param) {
      var newSortElements = $('#' + param.target.id + '> .section-card');
      var ids = [];
      for (var elemIdx=0; elemIdx < newSortElements.length; elemIdx++) {
        ids.push(newSortElements[elemIdx].id);
      }
      pg.descriptors.map(function(ds){
        if (ids.indexOf(ds.id) >= 0) {
          ds.parent = "#" + param.target.id;
        }
      });
      (Renderer.widgets[draggedDes.type])(draggedDes);
    });
  },
  
  reset: function() {
    $("#displayArea").html("");
  }
};


/*
 * All EventHandlers grouped and scoped under the object
 * 
 */
var EventHandlers = {
  dropdownEvent: function(e) {
    var dropdownRef = $(this);
    var descriptorIdx = dropdownRef.parent().data("desc-id");
    var widgetDesc = Renderer.page_meta.descriptors[descriptorIdx];
    widgetDesc.datasourceId = dropdownRef.data("value");
    Renderer.chartComponents.Clean(widgetDesc.id);
    var arg = {
      id : widgetDesc.id,
      title: widgetDesc.title,
      descId: descriptorIdx,
      description: widgetDesc.datasources[widgetDesc.datasourceId].description,
      datasources: widgetDesc.datasources
    };
    $("#" + widgetDesc.id).append(Renderer.templates.sectionCardTemplate(arg));
    $("#" + widgetDesc.id + " .title-text").html(widgetDesc.title + ": " + widgetDesc.datasources[widgetDesc.datasourceId].name);
    EventHandlers.popOverEvent("#" + widgetDesc.id + " [data-toggle='popover']");
    EventHandlers.maximizeEvent("#" + widgetDesc.id + " .glyphicon-resize-full")
    $("#" + widgetDesc.id + " .dropdown").on("click", "li", EventHandlers.dropdownEvent);
    (Renderer.widgets[widgetDesc.type])(widgetDesc);
  },
  timeFilterEvent: function(e) {
    var refScales = {"n-1h": "%H:%M", "n-1d": "%H:00", "n-1w": "%m/%d","n-1m": "%m/%d", "n-6months": "%m/%d", "n-1y": "%m/%Y", "start": "%Y"};
    var selector = $(this);

    var value = selector.val();
    var desc = Renderer.page_meta.descriptors.filter(function(ds) {
      return (ds.id === selector.parent().data("id"));
    })[0];
    desc.datasources[desc.datasourceId].params.starttime = value;
    desc.axes.categoryAxis.format = refScales[value];
    (Renderer.widgets["" + desc.type])(desc);
  },
  popOverEvent: function (selector) {
    $(selector).popover();
  },
  cardEffectEvent: function(e) {
    $(this).parent().siblings(".section-content").toggleClass("collapse expand");
  },
  maximizeEvent: function(selector) {
    $(selector).on("click", EventHandlers.toggleMaximize);
  },
  toggleMaximize: function(e) {
    var fsHandler = $("#fullscreen");
    var descId = $(this).data("descId");
    if (fsHandler.hasClass("minimized")) {
      fsHandler.html("")
               .toggleClass("maximized minimized");
      var maxWidDs = jQuery.extend(true, {}, Renderer.page_meta.descriptors[descId]);
      maxWidDs.parent = "#fullscreen";
      maxWidDs.id = "fs";
      var arg = {
        id : maxWidDs.id,
        title: maxWidDs.title,
        descId: descId,
        description: maxWidDs.datasources[maxWidDs.datasourceId].description,
        datasources: maxWidDs.datasources
      };
      fsHandler.append(Renderer.templates.sectionCardTemplate(arg));
      if (maxWidDs.margin) {
        var marginAdjust = maxWidDs.margin.top + maxWidDs.margin.bottom;
      }
      $("#" + maxWidDs.id + "Content").css({"width": "100%", "height": "97%"});
      (Renderer.widgets[maxWidDs.type])(maxWidDs);
      $("#fullscreen .glyphicon-resize-full").on("click", function() {
        EventHandlers.toggleMaximize();
      });
//      fsHandler.bind("DOMSubtreeModified", function(){
//        console.log("Rendered chart fullscreen!")
//        $("#fullscreen .glyphicon-resize-full").removeClass(".glyphicon-resize-full").addClass(".glyphicon-resize-small");
//        $("#fullscreen .glyphicon-resize-small").on("click", function() {
//          EventHandlers.toggleMaximize();
//        });
//      });
    } else {
      fsHandler.html("")
               .toggleClass("maximized minimized");
    }
  }
}

/*
 *  Load default page and register event for loading new pages
 */ 
DataFetch.get({
    dataUrl : "meta/dash.json",
    params: {}
  }, function(page_meta) {
  Renderer.initialize(page_meta);
});

$("#header .dropdown").on("click", "li", function(e) {
  Renderer.reset();
  DataFetch.get({
    dataUrl : "meta/" + $(this).data("page") + ".json",
    params: {}
  }, function(page_meta) {
    Renderer.initialize(page_meta);
  });
});