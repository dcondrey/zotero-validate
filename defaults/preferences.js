window.addEventListener('load', function() {
    console.log('Reference Validator Preferences Loaded');
    
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', function() {
            // Implementation for clearing cache
            alert('Source cache cleared.');
        });
    }
});
