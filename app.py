from flask import Flask, render_template, request
import duckdb
import numpy as np
import json
import copy
from sklearn.linear_model import LinearRegression

app = Flask(__name__)
discrete_filters = ['Internships', 'Projects', 'Workshops/Certifications', 
                    'PlacementStatus', 'ExtracurricularActivities', 'PlacementTraining']
continuous_filters = ['CGPA', 'AptitudeTestScore', 'SoftSkillsRating', 'SSC_Marks','HSC_Marks']
axis_options = {
    "x_axis": [
        "AptitudeTestScore", "CGPA", "SSC_marks", "HSC_marks",
        "SoftSkillsRating", "Internships", "Projects",
        "Workshops/Certifications"
    ],
    "y_axis": [
        "AptitudeTestScore", "CGPA", "SSC_marks", "HSC_marks",
        "SoftSkillsRating", "Internships", "Projects",
        "Workshops/Certifications"
    ]
}
agg_options = ["avg", "max", "min", "median", "stddev_pop", "count"]
facet_options = ["None", "placementStatus", "ExtracurricularActivities", "PlacementTraining"]


@app.route('/')
def index():
    discrete_filter_options = dict()
    for discrete_filter in discrete_filters:
        discrete_options_query = f"SELECT DISTINCT \"{discrete_filter}\" FROM placementdata.csv"
        discrete_options_results = duckdb.sql(discrete_options_query).df()
        
        # Put all of the options into a list
        discrete_options_list = list(discrete_options_results[discrete_filter])
        # Reverse the order of the list (sort descending) if there's only 2 options
        should_reverse = len(discrete_options_list) == 2
        discrete_filter_options[discrete_filter] = sorted(discrete_options_list, reverse=should_reverse)

    continuous_filter_options = dict()
    for continuous_filter in continuous_filters:
        continuous_options_query = f"SELECT MIN(\"{continuous_filter}\") AS min, MAX(\"{continuous_filter}\") AS max FROM placementdata.csv"
        continuous_options_results = duckdb.sql(continuous_options_query).df()
        continuous_filter_options[continuous_filter] = (continuous_options_results['min'][0], continuous_options_results['max'][0])

    # Define the dynamic options for the x-axis and y-axis dropdowns
    initial_axis_options = copy.deepcopy(axis_options)
    if "AptitudeTestScore" in initial_axis_options["y_axis"]:
        initial_axis_options["y_axis"].remove("AptitudeTestScore")

    return render_template(
        'index.html',
        axis_options=initial_axis_options,
        agg_options=agg_options,
        facet_options=facet_options,
        discrete_filters=discrete_filters,
        discrete_filter_options=discrete_filter_options,
        continuous_filter_options=continuous_filter_options
    )

@app.route('/update', methods=["POST"])
def update():
    request_data = request.get_json()
    continuous_predicate = ""
    # Start and_str at empty so the first thing isn't preceded by an AND
    and_str = ""
    for column, (min, max) in request_data["continuous_filters"].items():
        continuous_predicate += and_str + f'("{column}" >= {min} AND "{column}" <= {max})'
        and_str = " AND "
    
    discrete_predicate = ""
    for column, options in request_data["discrete_filters"].items():
        options_str = ', '.join(["'" + str(option) + "'" for option in options])
        # If there are no options, then the query should return nothing, so add impossible predicate
        if options_str == "":
            discrete_predicate += ' AND TRUE == FALSE'
        else:
            discrete_predicate += ' AND ' + f'"{column}"' + " IN (" + options_str + ")"
    

    predicate = continuous_predicate + discrete_predicate # Combine where clause from sliders and checkboxes

    x = request_data["x"]
    y = request_data["y"]
    agg = request_data["agg"]

    # If we're aggregating with count, make y-axis the same as x-axis 
    curr_y_axis_options = copy.deepcopy(axis_options["y_axis"])
    if agg == "count":
        y = x
        curr_y_axis_options = [x]
    elif x == y:
        curr_y_axis_options.remove(x)
        y = curr_y_axis_options[0]

    facet = request_data["facet"]
    facet_query = ""
    facet_group_by = ""
    facet_included = False
    if facet != "None":
        facet_query = f'"{facet}" AS facet, '
        facet_group_by = f', "{facet}"'
        facet_included = True

    # main SQL query
    query = f'SELECT "{x}" AS x, {agg}("{y}") AS y, {facet_query} COUNT("{x}") AS count FROM placementdata.csv WHERE {predicate} GROUP BY "{x}"{facet_group_by}'

    results = duckdb.sql(query).df()
    results_list = results.to_dict("records")

    # If no results return an empty dataset
    if len(results_list) == 0:
        return {
            "data": json.dumps([]), 
            "x_domain": json.dumps([]),
            "y_max": 100, 
            "y_axis_options": json.dumps(curr_y_axis_options),
            "facet_included": False, 
            "facet_list": json.dumps([]),
            "trendline": json.dumps([])
        }
    
    #query to get the min and max of x-axis 
    x_min_max_query = f'SELECT MAX("{x}") AS max, MIN("{x}") as min FROM placementdata.csv WHERE {predicate}'
    x_min_max_results = duckdb.sql(x_min_max_query).df()
    x_max = x_min_max_results['max'][0]
    x_min = x_min_max_results['min'][0]

    #determine step size for x axis, compute bins, and create even spaced axis vals
    step = 1
    if x == "CGPA" or x == "SoftSkillsRating":
        step = 0.1
    difference = round((x_max - x_min) * 10)/10
    num_bins = int(difference / step + 0.5) + 1

    x_domain_list = np.linspace(x_min, x_max, num_bins)
    facets_list = []

    # if a facet is included process the facet specific data
    if facet_included:
        sorted_results_list = sorted(results_list, key=lambda x: x["x"])
        facets_query = f'SELECT DISTINCT "{facet}" AS facet FROM placementdata.csv ORDER BY "{facet}" DESC'
        facets_results = duckdb.sql(facets_query).df()
        facets_list = list(facets_results['facet'])
    
        #initizalize empty data set for storing query results 
        empty_data_array = [] 
        for x_val in x_domain_list:
            obj = {
                'x': x_val,
                facets_list[0]: {'y': 0, 'count': 0},
                facets_list[1]: {'y': 0, 'count': 0}
            }
            empty_data_array.append(obj)

        # fill in data into array by iterating through results
        i = 0
        result_array_idx = 0
        while (i < len(sorted_results_list)):
            curr_idx = i
            next_idx = i + 1
            curr_elt = sorted_results_list[curr_idx]
            if next_idx < len(sorted_results_list):
                next_elt = sorted_results_list[next_idx]
            if curr_elt["x"] != empty_data_array[result_array_idx]["x"]:
                result_array_idx += 1
            elif next_idx > len(sorted_results_list) or curr_elt["x"] != next_elt["x"]:
                empty_data_array[result_array_idx][curr_elt["facet"]] = {
                    "y": curr_elt["y"], 
                    "count": curr_elt["count"]
                }
                result_array_idx += 1
                i += 1
            else:
                new_elt = {
                    "x": curr_elt["x"], 
                    curr_elt["facet"]: {
                        "y": curr_elt["y"], 
                        "count": curr_elt["count"]
                    }, 
                    next_elt["facet"]: {
                        "y": next_elt["y"], 
                        "count": next_elt["count"]
                    }
                }
                empty_data_array[result_array_idx] = new_elt
                result_array_idx += 1
                i += 2
        
        results_list = empty_data_array

    #query for maximum y axis value
    y_max_query = f'SELECT MAX(y) AS y_max FROM (SELECT {agg}("{y}") AS y FROM placementdata.csv WHERE {predicate} GROUP BY "{x}"{facet_group_by})'
    y_max_results = duckdb.sql(y_max_query).df()
    y_max = y_max_results["y_max"][0] if y_max_results["y_max"][0] is not None else 0

    
    # statistical analysis - trendline one line if facet not included two if facet included
    trendline_points = []
    if not facet_included:
        x_vals = [[elt["x"]] for elt in results_list if elt["y"] != 0]
        y_vals = [elt["y"] for elt in results_list if elt["y"] != 0]

        model = LinearRegression()
        model.fit(x_vals, y_vals)
        y_trend = model.predict(x_vals)
        trendline_points = [{"x": float(x[0]), "y": float(y)} for x, y in zip(x_vals, y_trend)]

    else:
        # for only keeping the valid facets
        facet_values = [facet for facet in facets_list if facet in results_list[0]]  
        trendline_points = {}

        for facet in facet_values:
            x_vals = [[elt["x"]] for elt in results_list if facet in elt and "y" in elt[facet] and elt[facet]["y"] != 0]
            y_vals = [elt[facet]["y"] for elt in results_list if facet in elt and "y" in elt[facet] and elt[facet]["y"] != 0]
           
            if len(x_vals) > 0:
                model = LinearRegression()
                model.fit(x_vals, y_vals)

                y_trend = model.predict(x_vals)
                trendline_points[facet] = [{"x": float(x[0]), "y": float(y)} for x, y in zip(x_vals, y_trend)]

    #return all computed values for updating the visualization
    return {
        "data": json.dumps(results_list), 
        "x_domain": json.dumps(x_domain_list.tolist()), 
        "y_max": float(y_max), 
        "facet_included": facet_included,
        "facet_list": json.dumps(facets_list),
        "y_axis_options": json.dumps(curr_y_axis_options),
        "trendline": json.dumps(trendline_points)
    }

def capitalize_first_letter(row):
    return row['month'][0].upper() + row['month'][1:]


if __name__ == "__main__":
    app.run(debug=True)
