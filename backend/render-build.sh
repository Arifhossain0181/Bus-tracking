#!/usr/bin/env bash
# render-build.sh: Build script for Render deployment
set -e


# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt



# Collect static files
python manage.py collectstatic --noinput

# Apply migrations
python manage.py migrate --noinput

# (Optional) Seed initial data
# python manage.py loaddata initial_data.json

# Print success message
echo "Build completed successfully."
