import os
import re
import json
import logging
import requests
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from flask import Flask, render_template, jsonify, request

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Cache configuration
CACHE_FILE = 'release_notes_cache.json'
FEED_URL = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'

class FeedContentParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.updates = []
        self.current_type = None
        self.current_html = []
        self.collecting_type = False
        
    def handle_starttag(self, tag, attrs):
        if tag == 'h3':
            self.save_current_update()
            self.current_type = ''
            self.collecting_type = True
            self.current_html = []
        else:
            if self.current_type is not None and not self.collecting_type:
                # Reconstruct HTML tag
                attr_list = []
                for k, v in attrs:
                    if v is not None:
                        v_esc = v.replace('"', '&quot;')
                        attr_list.append(f'{k}="{v_esc}"')
                    else:
                        attr_list.append(k)
                attr_str = " " + " ".join(attr_list) if attr_list else ""
                self.current_html.append(f"<{tag}{attr_str}>")
                
    def handle_endtag(self, tag):
        if tag == 'h3':
            self.collecting_type = False
        else:
            if self.current_type is not None and not self.collecting_type:
                self.current_html.append(f"</{tag}>")
                
    def handle_data(self, data):
        if self.collecting_type:
            self.current_type += data
        elif self.current_type is not None:
            self.current_html.append(data)
            
    def save_current_update(self):
        if self.current_type is not None:
            html_content = "".join(self.current_html).strip()
            html_content = re.sub(r'\s+', ' ', html_content)
            
            # Map type to a standard category and color-code
            raw_type = self.current_type.strip()
            normalized_type = raw_type.title()
            
            # Extract plain text for tweeting
            # Strip tags and normalize spacing
            plain_text = re.sub(r'<[^>]+>', '', html_content)
            plain_text = re.sub(r'\s+', ' ', plain_text).strip()
            
            self.updates.append({
                'type': normalized_type or 'General',
                'html': html_content,
                'text': plain_text
            })
            self.current_type = None
            self.current_html = []
            
    def close(self):
        self.save_current_update()
        super().close()

def fetch_and_parse_feed():
    logger.info(f"Fetching BigQuery release notes from {FEED_URL}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(FEED_URL, headers=headers, timeout=15)
    response.raise_for_status()
    
    xml_data = response.content
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    all_updates = []
    
    for entry in root.findall('atom:entry', ns):
        date_str = entry.find('atom:title', ns).text
        updated_str = entry.find('atom:updated', ns).text
        entry_id = entry.find('atom:id', ns).text
        
        content_elem = entry.find('atom:content', ns)
        if content_elem is None or not content_elem.text:
            continue
            
        parser = FeedContentParser()
        parser.feed(content_elem.text)
        parser.close()
        
        for idx, upd in enumerate(parser.updates):
            all_updates.append({
                'id': f"{entry_id}_{idx}",
                'date': date_str,
                'updated': updated_str,
                'type': upd['type'],
                'html': upd['html'],
                'text': upd['text']
            })
            
    logger.info(f"Successfully fetched and parsed {len(all_updates)} individual updates.")
    return all_updates

def load_data(force_refresh=False):
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                logger.info("Loading release notes from cache...")
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading cache: {e}. Falling back to fetch.")
            
    # Fetch and update cache
    try:
        data = fetch_and_parse_feed()
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data
    except Exception as e:
        logger.error(f"Error fetching feed: {e}")
        # If fetch fails but cache exists, return cache as backup
        if os.path.exists(CACHE_FILE):
            logger.warning("Fetch failed. Returning cached data as fallback.")
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data = load_data(force_refresh=force_refresh)
        return jsonify({
            'status': 'success',
            'count': len(data),
            'notes': data
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/stats')
def get_stats():
    try:
        data = load_data(force_refresh=False)
        types_breakdown = {}
        for item in data:
            t = item['type']
            types_breakdown[t] = types_breakdown.get(t, 0) + 1
            
        return jsonify({
            'status': 'success',
            'total_updates': len(data),
            'types': types_breakdown,
            'last_updated': os.path.getmtime(CACHE_FILE) if os.path.exists(CACHE_FILE) else None
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    # For local execution, run on port 5000
    app.run(debug=True, host='127.0.0.1', port=5000)
