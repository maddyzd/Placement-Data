margin = {top: 20, right: 45, bottom: 30, left: 70};
width = 900 - margin.left - margin.right;
height = 570 - margin.top - margin.bottom;

var svg;

// for the hover box
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip");

// Draws the sliders for the continuous filters
function draw_slider(column, min, max) {
    var slider = document.getElementById(column + "-slider");
    var step = min >= 10 ? 1 : 0.1;
 
    var tooltipFormatter = {
        to: function(value) {
            return min >= 10 ? value.toFixed(0) : value.toFixed(1);
        },
        from: function(value) {
            return Number(value);
        }
    };
    
    noUiSlider.create(slider, {
        start: [min, max],
        connect: [false, true, false],
        tooltips: [tooltipFormatter, tooltipFormatter],
        step: step,
        range: { min: min, max: max },
    });
    
    slider.noUiSlider.on("change", function () {
        update();
    });
}


// updating graph when check boxes are changed 
function update_checked(checkbox){
  checkbox.classList.toggle('option-selected')
  update()
}

// Draws the svg
function draw_svg(margin, width, height) {
    svg = d3
        .select("#bar")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .style("background-color", "#dbdad7")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .attr("class", "bar-chart");
    return svg;
}

// Draws the facet legend (key)
function draw_legend(facet_domain, color_scale, facet_included) {
    let legendContainer = d3.select("#legend");
    legendContainer.selectAll("*").remove();

    if (!facet_included) return;

    let legendSvg = legendContainer.append("svg")
        .attr("width", 200)
        .attr("height", facet_domain.length * 25);

    let legend = legendSvg.selectAll(".legend-item")
        .data(facet_domain)
        .enter()
        .append("g")
        .attr("class", "legend-item")
       

    legend.append("rect")
        .attr("x", 10) 
        .attr("y", (d, i) => i * 25)
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", d => color_scale(d));

    legend.append("text")
        .attr("x", 30) 
        .attr("y", (d, i) => i * 25 + 12) 
        .text(d => d)
        .style("font-size", "14px")
        .attr("alignment-baseline", "middle");
}

// draw x axis 
function draw_xaxis(svg, height, scale) {
    // A filter for the x-axis that displays every 5 ticks or all of the ticks
    // depending on how many elements are in the domain
    var filter = function(d, i) {
        if (scale.domain().length <= 10) {
            return true;
        } else {
            return i % 5 == 0;
        }
    }
    if (svg.select(".xaxis").empty()) {
        svg
        .append("g")
        .attr("class", "xaxis")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(scale).tickValues(scale.domain().filter(filter)))
    } else {
        svg.select(".xaxis")
        .transition().duration(1000)
        .call(d3.axisBottom(scale).tickValues(scale.domain().filter(filter)))
    }
}

// draws y axis
function draw_yaxis(svg, scale) {
    if (svg.select(".yaxis").empty()) {
        svg
        .append("g")
        .attr("class", "yaxis")
        .call(d3.axisLeft(scale));
    } else {
        svg.select(".yaxis")
        .transition().duration(1000)
        .call(d3.axisLeft(scale));
    }
}

// function to draw an axis calling draw_xaxis and draw_yaxis
function draw_axis(axis, svg, height, domain, range) {
    if (axis == "x") {
        var scale = d3.scaleBand().domain(domain).range(range).padding([0.2]);
        draw_xaxis(svg, height, scale);
    } 
    // Otherwise axis is y, so must be continuous
    else {
        var scale = d3.scaleLinear().domain(domain).range(range);
        draw_yaxis(svg, scale);
    }
    return scale;
}


// Function that draws the x and y axes
function draw_axes(svg, width, height, x_domain, y_domain, facet_included, facet_domain) {
    var scales = {}
    var x_scale = draw_axis("x", svg, height, x_domain, [0, width]);
    scales["x"] = x_scale
    var y_scale = draw_axis("y", svg, height, y_domain, [height, 0]);
    scales["y"] = y_scale
    if (facet_included) {
        var facet_scale = d3.scaleBand().domain(facet_domain).range([0, x_scale.bandwidth()]).padding([0.05])
        scales["facet"] = facet_scale
        var color_scale = d3.scaleOrdinal().domain(facet_domain).range(['#35827f', '#85482e'])
        scales["color"] = color_scale

        draw_legend(facet_domain, color_scale, facet_included);
    } else {
        draw_legend(false, [], null); 
    }
    return scales;
}

//function to draw the bars for the bar chart
function draw_bar(data, svg, scales, facet_included, facet_list) {

    svg.select(".bar-chart").remove();

    let barChart = svg.append("g").attr("class", "bar-chart");

    if (facet_included) {
        let groups = barChart.selectAll("g")
            .data(data, d => d.x)
            .join("g")
            .attr("transform", d => `translate(${scales.x(d.x)},0)`);

        groups.selectAll("rect")
            .data(d => facet_list.map(facet => ({
                facet, 
                x: d.x, 
                y: d[facet]?.y || 0, 
                count: d[facet]?.count || 0 
            }))) 
            .join("rect")
            .attr("x", d => scales.facet(d.facet))  
            .attr("y", d => scales.y(d.y))  
            .attr("width", scales.facet.bandwidth())  
            .attr("height", d => height - scales.y(d.y))
            .attr("fill", d => scales.color(d.facet))
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .on("mouseover", function(event, d) {

                let xAxisLabel = d3.select("#x-axis-label").text().trim();
                let yAxisLabel = d3.select("#y-axis-label").text().trim();
                let facetName = d3.select("#facet-select").property("value");
            
                d3.select("#x-axis-tooltip").text(xAxisLabel + ": ");
                d3.select("#y-axis-tooltip").text(yAxisLabel + ": ");
            
                d3.select("#xval").text(d.x);
                d3.select("#yval").text(d.y.toFixed(2));
                d3.select("#countval").text(d.count);
                d3.select("#facet-label").style("display", "block").text(facetName + ": " + d.facet);            
            
                d3.select("#tooltip")
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 40) + "px")
                    .transition()
                    .style("visibility", "visible");

                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr("stroke-width", 3);
            })            
            .on("mousemove", function(event) {
                d3.select("#tooltip")
                  .style("left", (event.pageX + 10) + "px")
                  .style("top", (event.pageY - 40) + "px");
            })
            .on("mouseout", function() {
                d3.select("#tooltip").transition().style("visibility", "hidden");
            
                d3.select(this)
                .transition()
                .duration(100)
                .attr("stroke-width", 1);
            });

    } else {
        barChart.selectAll("rect")
            .data(data, d => d.x)
            .join("rect")
            .attr("x", d => scales.x(d.x))
            .attr("y", d => scales.y(d.y))
            .attr("width", scales.x.bandwidth())  
            .attr("height", d => height - scales.y(d.y))
            .attr("fill", "rgb(84, 129, 176)")
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .on("mouseover", function(event, d) {
                // Fetch actual axis labels from the page
                let xAxisLabel = d3.select("#x-axis-label").text().trim();
                let yAxisLabel = d3.select("#y-axis-label").node().textContent.trim();

                // Ensure both labels appear with a colon and space
                d3.select("#x-axis-tooltip").text(xAxisLabel + ": ");
                d3.select("#y-axis-tooltip").text(yAxisLabel + ": ");
            
                d3.select("#xval").text(d.x);
                d3.select("#yval").text(d.y.toFixed(2));
                d3.select("#countval").text(d.count);
                d3.select("#facet-label").style("display", "none")
                     
                d3.select("#tooltip")
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 40) + "px")
                    .transition()
                    .style("visibility", "visible");

                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr("stroke-width", 3);
            })            
            .on("mousemove", function(event) {
                d3.select("#tooltip")
                  .style("left", (event.pageX + 10) + "px")
                  .style("top", (event.pageY - 40) + "px");
            })
            .on("mouseout", function() {
                d3.select("#tooltip").transition().style("visibility", "hidden");
            
                d3.select(this)
                .transition()
                .duration(100)
                .attr("stroke-width", 1);
            });
    }
}

// function that extracts the parameters
function get_params() {
    var continuous_filters = {}
    d3.selectAll(".slider").each(function(d, i) { 
        continuous_filters[this.id.slice(0, -7)] = this.noUiSlider.get()
    });
    var discrete_filters = {}
    d3.selectAll(".discrete-filter").each(function(d, i) { 
        var possibleVals = []
        d3.select(this).selectAll(".checkbox").each(function(d, i) {
            if (d3.select(this).classed("option-selected")) {
                possibleVals.push(this.value)
            }
        })
        discrete_filters[this.id.slice(0, -7)] = possibleVals
    });

    return {
        "x": document.getElementById('x-axis-select').value,
        "y": document.getElementById('y-axis-select').value,
        "agg": document.getElementById('agg-func-select').value,
        "facet": document.getElementById('facet-select').value,
        "continuous_filters": continuous_filters,
        "discrete_filters": discrete_filters
    }
}

function capitalizeWords(str) {
    return str.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// update chart title and x and y axis titles 
function update_title() {
    var xAxis = document.getElementById("x-axis-select").value;
    var yAxis = document.getElementById("y-axis-select").value;
    var aggFunc = document.getElementById("agg-func-select").value;
    
    var titleText = capitalizeWords(`${aggFunc} of ${yAxis} vs ${xAxis}`);
    var xText = capitalizeWords(`${xAxis}`);
    var yText = capitalizeWords(`${aggFunc} of ${yAxis}`);

    // Select the title element and update its text
    d3.select("#chart-title").text(titleText);
    d3.select("#x-axis-label").text(xText);
    d3.select("#y-axis-label").text(yText);
}

// function to draw the trendline on the bar graph
function draw_trendline(svg, scales, facet_included, facet_list, trendline) {
    svg.select(".line1").remove();
    svg.select(".line2").remove();
    const line = d3.line()
        .x(d => scales.x(d.x) + scales.x.bandwidth() / 2)
        .y(d => scales.y(d.y));

    if (!facet_included) {
        if (trendline.length > 0) {
            svg.append("path")
                .datum(trendline)
                .attr("class", "line1")
                .attr("d", line)
                .style("stroke", "black")
                .style("stroke-width", "3px");
        }
    } else {
        facet_list.forEach((facet, index) => {
            if (trendline[facet]) {
                svg.append("path")
                    .datum(trendline[facet])
                    .attr("class", `line${index + 1}`)
                    .attr("d", line)
                    .style("stroke", index === 0 ? "#69c2be" : "#c28165")
                    .style("stroke-width", "3px");
            }
        });
    }
}

//update bars function based on new selections 
function update_bar(svg, data, x_domain, y_max, facet_included, facet_list, trendline) {
    var scales = draw_axes(svg, width, height, x_domain, [0, y_max], facet_included, facet_list)
    svg.select(".bar-chart").remove();
    draw_bar(data, svg, scales, facet_included, facet_list);
    draw_trendline(svg, scales, facet_included, facet_list, trendline)

}

// function to retrieve current state of dropdowns, sliders, and checkboxes
// and update visualization accordingly 
function update() {
    params = get_params();

    fetch("/update", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(params),
        cache: "no-cache",
        headers: new Headers({
        "content-type": "application/json",
        }),
    }).then(async function (response) {
        var results = JSON.parse(JSON.stringify(await response.json()));
        update_bar(svg, 
            JSON.parse(results["data"]), 
            JSON.parse(results["x_domain"]), 
            results["y_max"], 
            results["facet_included"],
            JSON.parse(results["facet_list"]),
            JSON.parse(results["trendline"]),
        )
        update_yaxis_dropdown(JSON.parse(results["y_axis_options"]));
        update_title();
    });
} 

//update y axis dropdown options based on selections
function update_yaxis_dropdown(y_axis_options) {
    var selected_option = ""
    d3.select("#y-axis-select").selectAll("option").each(function (d, i) {
        if (d3.select(this).property("selected")) {
            selected_option = this.value
        }
    })
    d3.select("#y-axis-select").selectAll("option").data(y_axis_options)
        .join("option")
        .text(d => d)
        .attr("id", d => "y-axis-option-" + d)
        .attr("value", d => d)
        .property("selected", d => d == selected_option)
}


// Wait until the DOM content has loaded to draw the svg, axes, and update
d3.select(window).on("DOMContentLoaded", function () {
    svg = draw_svg(margin, width, height)
    update()

});

