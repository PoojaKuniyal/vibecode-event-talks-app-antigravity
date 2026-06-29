// BigQuery Release Notes Tracker - Client App

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let releaseNotes = [];
    let selectedNoteId = null;
    let originalDraftText = '';
    
    // DOM Elements
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = document.getElementById('refresh-icon');
    const searchInput = document.getElementById('search-input');
    const typeFilter = document.getElementById('type-filter');
    const sortOrder = document.getElementById('sort-order');
    
    // States elements
    const feedLoading = document.getElementById('feed-loading');
    const feedError = document.getElementById('feed-error');
    const feedEmpty = document.getElementById('feed-empty');
    const notesList = document.getElementById('notes-list');
    const retryBtn = document.getElementById('retry-btn');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    
    // Stats Elements
    const statTotal = document.getElementById('stat-total');
    const statFeatures = document.getElementById('stat-features');
    const statChanges = document.getElementById('stat-changes');
    const statFixes = document.getElementById('stat-fixes');
    const statLastSync = document.getElementById('stat-last-sync');
    
    // Composer Elements
    const composerInstruction = document.getElementById('composer-empty-instruction');
    const composerEditor = document.getElementById('composer-editor');
    const selectedTypeBadge = document.getElementById('selected-type-badge');
    const selectedDateBadge = document.getElementById('selected-date-badge');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const clearTweetBtn = document.getElementById('clear-tweet-btn');
    const charCount = document.getElementById('char-count');
    const charProgressRing = document.getElementById('char-progress-ring');
    const charLimitWarning = document.getElementById('char-limit-warning');
    const resetDraftBtn = document.getElementById('reset-draft-btn');
    const tweetBtn = document.getElementById('tweet-btn');
    const hashtagChips = document.querySelectorAll('.hashtag-chips .chip:not(#add-link-chip)');
    const addLinkChip = document.getElementById('add-link-chip');

    // Official Feed Link constant
    const OFFICIAL_NOTES_LINK = "https://cloud.google.com/bigquery/docs/release-notes";
    addLinkChip.dataset.text = OFFICIAL_NOTES_LINK;

    // --- Theme Management ---
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
            themeIcon.className = 'fa-solid fa-sun';
        } else {
            body.classList.remove('light-theme');
            themeIcon.className = 'fa-solid fa-moon';
        }
    };

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('light-theme');
        const isLight = body.classList.contains('light-theme');
        themeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });

    // --- Progress Ring for Character Counter ---
    const radius = 10;
    const circumference = 2 * Math.PI * radius;
    charProgressRing.style.strokeDasharray = `${circumference} ${circumference}`;

    const setProgress = (percent) => {
        const offset = circumference - (percent / 100 * circumference);
        charProgressRing.style.strokeDashoffset = offset;
    };

    // --- Stats Update Helper ---
    const updateStats = () => {
        statTotal.textContent = releaseNotes.length;
        
        const counts = { Feature: 0, Change: 0, Fix: 0 };
        releaseNotes.forEach(note => {
            if (counts[note.type] !== undefined) {
                counts[note.type]++;
            } else if (note.type === 'General') {
                // Count general or undefined towards change/other
            }
        });
        
        statFeatures.textContent = counts.Feature;
        statChanges.textContent = counts.Change;
        statFixes.textContent = counts.Fix;
        
        // Load timestamp
        fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.last_updated) {
                    const date = new Date(data.last_updated * 1000);
                    statLastSync.textContent = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ', ' + date.toLocaleDateString();
                }
            })
            .catch(() => {
                statLastSync.textContent = new Date().toLocaleDateString();
            });
    };

    // --- Tweet Composer Logic ---
    const updateCharCount = () => {
        const text = tweetTextarea.value;
        const count = text.length;
        charCount.textContent = count;
        
        // Progress percentage up to 280
        const percentage = Math.min((count / 280) * 100, 100);
        setProgress(percentage);
        
        // Colors and limits warnings
        if (count > 280) {
            charCount.style.color = 'var(--text-deprecated)';
            charProgressRing.style.stroke = 'var(--text-deprecated)';
            charLimitWarning.classList.remove('hidden');
            tweetBtn.disabled = true;
            tweetBtn.style.opacity = 0.5;
            tweetBtn.style.cursor = 'not-allowed';
        } else {
            charCount.style.color = count >= 250 ? '#fbbf24' : 'var(--text-secondary)';
            charProgressRing.style.stroke = count >= 250 ? '#fbbf24' : 'var(--twitter-blue)';
            charLimitWarning.classList.add('hidden');
            tweetBtn.disabled = false;
            tweetBtn.style.opacity = 1;
            tweetBtn.style.cursor = 'pointer';
        }
    };

    const draftTweet = (note) => {
        selectedNoteId = note.id;
        
        // Set Header
        selectedTypeBadge.textContent = note.type;
        selectedTypeBadge.className = `type-pill type-${note.type.toLowerCase()}`;
        selectedDateBadge.textContent = note.date;
        
        // Formulate Draft
        const header = `BigQuery ${note.type} Update (${note.date}):\n`;
        const footer = `\n\n#BigQuery #GCP`;
        
        // Calculate max text space: 280 total - header length - footer length
        const availableTextSpace = 280 - header.length - footer.length;
        let mainText = note.text;
        
        if (mainText.length > availableTextSpace) {
            mainText = mainText.substring(0, availableTextSpace - 3) + '...';
        }
        
        originalDraftText = `${header}${mainText}${footer}`;
        tweetTextarea.value = originalDraftText;
        
        // Show Editor, Hide instruction
        composerInstruction.classList.add('hidden');
        composerEditor.classList.remove('hidden');
        
        // Smooth scroll composer on mobile if needed
        if (window.innerWidth <= 1024) {
            document.getElementById('composer-widget').scrollIntoView({ behavior: 'smooth' });
        }
        
        updateCharCount();
        highlightSelectedCard();
    };

    const highlightSelectedCard = () => {
        document.querySelectorAll('.note-card').forEach(card => {
            if (card.dataset.id === selectedNoteId) {
                card.classList.add('selected-for-tweet');
            } else {
                card.classList.remove('selected-for-tweet');
            }
        });
    };

    tweetTextarea.addEventListener('input', updateCharCount);

    clearTweetBtn.addEventListener('click', () => {
        tweetTextarea.value = '';
        tweetTextarea.focus();
        updateCharCount();
    });

    resetDraftBtn.addEventListener('click', () => {
        tweetTextarea.value = originalDraftText;
        updateCharCount();
    });

    tweetBtn.addEventListener('click', () => {
        const text = tweetTextarea.value;
        if (text.length === 0) return;
        
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    });

    // Append Hashtags
    hashtagChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const hashtag = chip.dataset.text;
            const currentText = tweetTextarea.value;
            
            // Check if hashtag already exists
            if (currentText.includes(hashtag)) return;
            
            // Append with proper spacing
            if (currentText.trim() === '') {
                tweetTextarea.value = hashtag;
            } else {
                tweetTextarea.value = currentText.trim() + ' ' + hashtag;
            }
            tweetTextarea.focus();
            updateCharCount();
        });
    });

    // Add Link
    addLinkChip.addEventListener('click', () => {
        const link = addLinkChip.dataset.text;
        const currentText = tweetTextarea.value;
        
        if (currentText.includes(link)) return;
        
        if (currentText.trim() === '') {
            tweetTextarea.value = link;
        } else {
            tweetTextarea.value = currentText.trim() + ' ' + link;
        }
        tweetTextarea.focus();
        updateCharCount();
    });

    // --- Render Cards ---
    const renderNotes = (notes) => {
        notesList.innerHTML = '';
        
        if (notes.length === 0) {
            feedEmpty.classList.remove('hidden');
            return;
        }
        
        feedEmpty.classList.add('hidden');
        
        notes.forEach(note => {
            const isSelected = note.id === selectedNoteId;
            const cardClass = `note-card card note-${note.type.toLowerCase()} ${isSelected ? 'selected-for-tweet' : ''}`;
            
            const card = document.createElement('article');
            card.className = cardClass;
            card.dataset.id = note.id;
            
            // Generate Type Badge icon
            let iconClass = 'fa-solid fa-circle-info';
            if (note.type === 'Feature') iconClass = 'fa-solid fa-wand-magic-sparkles';
            else if (note.type === 'Change') iconClass = 'fa-solid fa-circle-notch';
            else if (note.type === 'Fix') iconClass = 'fa-solid fa-bug';
            else if (note.type === 'Deprecated') iconClass = 'fa-solid fa-triangle-exclamation';

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-metadata">
                        <span class="type-pill type-${note.type.toLowerCase()}">
                            <i class="${iconClass}"></i> ${note.type}
                        </span>
                        <span class="date-badge">
                            <i class="fa-regular fa-calendar-days"></i> ${note.date}
                        </span>
                    </div>
                    <div class="card-selector" title="Select to craft a Tweet">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
                <div class="card-body">
                    ${note.html}
                </div>
                <div class="card-actions">
                    <button class="btn btn-secondary btn-xs btn-draft" title="Draft a tweet with this update">
                        <i class="fa-brands fa-x-twitter"></i> Draft Tweet
                    </button>
                    <button class="btn btn-twitter btn-xs btn-quick-tweet" title="Tweet immediately">
                        <i class="fa-solid fa-paper-plane"></i> Quick Tweet
                    </button>
                </div>
            `;
            
            // Event Listeners
            // Select row by clicking headers or selectors
            const selectTarget = card.querySelector('.card-selector');
            selectTarget.addEventListener('click', (e) => {
                e.stopPropagation();
                draftTweet(note);
            });
            
            // Action buttons
            card.querySelector('.btn-draft').addEventListener('click', (e) => {
                e.stopPropagation();
                draftTweet(note);
            });
            
            card.querySelector('.btn-quick-tweet').addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Formulate a quick clean Tweet and trigger window.open
                const text = `BigQuery ${note.type} (${note.date}): ${note.text} ${OFFICIAL_NOTES_LINK} #BigQuery #GCP`;
                // Crop if it exceeds 280
                let shareText = text;
                if (text.length > 280) {
                    const suffix = ` ${OFFICIAL_NOTES_LINK} #BigQuery #GCP`;
                    const allowedLen = 280 - suffix.length;
                    const truncatedDesc = note.text.substring(0, allowedLen - 3) + '...';
                    shareText = `BigQuery ${note.type} (${note.date}): ${truncatedDesc}${suffix}`;
                }
                
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
            });
            
            // Clicking the card itself highlights it
            card.addEventListener('click', () => {
                draftTweet(note);
            });

            notesList.appendChild(card);
        });
    };

    // --- Search, Filters & Sorting Logic ---
    const filterAndSortNotes = () => {
        const query = searchInput.value.toLowerCase().trim();
        const selectedType = typeFilter.value;
        const order = sortOrder.value;
        
        let filtered = releaseNotes.filter(note => {
            // Category Filter
            const matchesType = (selectedType === 'All') || (note.type === selectedType);
            
            // Search Query Filter
            const matchesQuery = !query || 
                                 note.text.toLowerCase().includes(query) || 
                                 note.type.toLowerCase().includes(query) ||
                                 note.date.toLowerCase().includes(query);
                                 
            return matchesType && matchesQuery;
        });
        
        // Sorting (dates are parsed to ISO date string implicitly inside updated_str or sorted using date object)
        filtered.sort((a, b) => {
            const dateA = new Date(a.updated || a.date);
            const dateB = new Date(b.updated || b.date);
            return order === 'desc' ? dateB - dateA : dateA - dateB;
        });
        
        renderNotes(filtered);
    };

    searchInput.addEventListener('input', filterAndSortNotes);
    typeFilter.addEventListener('change', filterAndSortNotes);
    sortOrder.addEventListener('change', filterAndSortNotes);
    
    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        typeFilter.value = 'All';
        filterAndSortNotes();
    });
    
    feedEmpty.querySelector('#clear-filters-btn').addEventListener('click', () => {
        searchInput.value = '';
        typeFilter.value = 'All';
        filterAndSortNotes();
    });

    // --- Data Fetching ---
    const fetchNotes = (forceRefresh = false) => {
        // UI states
        feedLoading.classList.remove('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');
        notesList.classList.add('hidden');
        
        // Trigger rotate animation on sync button
        refreshBtn.disabled = true;
        refreshIcon.classList.add('spin-anim');
        
        const url = `/api/notes${forceRefresh ? '?refresh=true' : ''}`;
        
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    releaseNotes = data.notes;
                    updateStats();
                    filterAndSortNotes();
                    
                    notesList.classList.remove('hidden');
                } else {
                    throw new Error(data.message || 'Unknown server error');
                }
            })
            .catch(err => {
                console.error('Error fetching release notes:', err);
                document.getElementById('error-message').textContent = `Could not fetch notes: ${err.message}. Please try again later.`;
                feedError.classList.remove('hidden');
            })
            .finally(() => {
                feedLoading.classList.add('hidden');
                refreshBtn.disabled = false;
                refreshIcon.classList.remove('spin-anim');
            });
    };

    // Attach Refresh Listener
    refreshBtn.addEventListener('click', () => {
        fetchNotes(true);
    });

    retryBtn.addEventListener('click', () => {
        fetchNotes(false);
    });

    // --- Init ---
    initTheme();
    fetchNotes(false);
});
