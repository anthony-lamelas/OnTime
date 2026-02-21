# EDA & Feature Engineering Update: Uriel Olayinka

## Overview
This branch adds initial Exploratory Data Analysis (EDA) visualizations and introduces new temporal features to the aggregated NYC transit dataset to help with our upcoming predictive modeling.

## Data File Changes
I added a new folder with the new columns for safety. 
* **`final_data/`**: Contains the original data that Edward prepared.
* **`final_data_updated/`**: The new directory that I made. It has the exact same dataset, but with two new columns: `season` and `holiday`.

## Features
* **`season`**: I extracted the season from the `month_period` column. Since there are no exact days in the data (aggregated by weekday for the month), it's not 100% accurate. I did Dec, Jan, and Feb for winter, Mar, Apr, and May for spring, Jun, Jul, and Aug for summer, and Sep, Oct, and Nov for fall.
* **`holiday`**: Currently populated with a placeholder `"no"` for all rows. Again, since our current data is aggregated by weekday across the entire month, we can't isolate specific holiday dates yet. We'll revisit this if/when we get the unaggregated daily files.

## Requirements
I added matplotlib and seaborn to the requirements.txt file.

## Running
I ran mine with a virtual environment due to all of the libraries and required versions. You may or may not need to.
