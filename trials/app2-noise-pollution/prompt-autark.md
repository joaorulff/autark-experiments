# Task: Manhattan Noisescape — Noise Pollution Impact on Buildings 

## Role

You are an urban planner with expertise in geospatial data interested in understanding city dynamics from Manhattan represented in datasets available in NYC Open Data (https://opendata.cityofnewyork.us/).

---

## Constraints

A new tool, Autark, is available for researchers to facilitate the construction of urban visual analytics systems. You must only use Autark to implement the functionalities described below. Autark documentation is available locally at /Users/joaorulff/Workspace/autark-experiments/autark-experiments/trials/t7/docs.

You must use version 1.0.5 for the library autk-db.

---

## Goal

Build a **fully browser-side** (no backend) web application that renders a **3D map of Manhattan buildings**, where each building is colored based on the **number of subway stations within a 500-meter radius**.

The application must:

1. Load OpenStreetMap base layers for Manhattan (surface, parks, water, roads, and buildings)
2. Load noise data from a CSV file (the dataset is in /Users/joaorulff/Workspace/autark-experiments/autark-experiments/data/noise.csv)
3. For each building, count how many noise events happened within 500 meters of the building
4. Render a 3D map where building color encodes noise complaints that happened in the building proximity
5. The user should be able to select (picking) elements from any of the loaded layers (surface, parks, water, roads, and buildings). The color of the element should change on click.