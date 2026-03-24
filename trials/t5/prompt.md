# Task: Manhattan Buildings — Subway Accessibility 3D Map

## Role

You are an urban planner with expertise in geospatial data interested in understanding city dynamics from Manhattan represented in datasets available in NYC Open Data (https://opendata.cityofnewyork.us/).

---

## Constraints

A new tool, Autark, is available for researchers to facilitate the construction of urban visual analytics systems. You must only use Autark to implement the functionalities described below. Autark documentation is available locally at /Users/joaorulff/Workspace/autark-experiments/autark-experiments/trials/t5/docs.

---

## Goal

Build a **fully browser-side** (no backend) web application that renders a **3D map of Manhattan buildings**, where each building is colored based on the **number of subway stations within a 500-meter radius**.

The application must:

1. Load OpenStreetMap base layers for Manhattan (surface, parks, water, roads, and buildings)
2. Load subway station data from a CSV file (the dataset is in /Users/joaorulff/Workspace/autark-experiments/autark-experiments/data/subway_manhattan_clean.csv)
3. For each building, count how many subway stations are within 500 meters
4. Render a 3D map where building color encodes subway station proximity