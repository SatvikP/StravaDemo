// Your Strava app credentials
const CLIENT_ID = '164066'; // Replace with your actual Client ID
const REDIRECT_URI = 'http://localhost:3000/strava-app.html';
const SCOPE = 'read,activity:read';

// DOM elements
const loginSection = document.getElementById('login-section');
const activitiesSection = document.getElementById('activities-section');
const loginBtn = document.getElementById('login-btn');
const activitiesList = document.getElementById('activities-list');

// Set up login button
loginBtn.href = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}`;

// Check if we just came back from Strava with an authorization code
window.addEventListener('load', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    
    if (authCode) {
        // We got an auth code! Now exchange it for an access token
        exchangeCodeForToken(authCode);
    } else {
        // Check if we already have a token stored
        const accessToken = localStorage.getItem('strava_access_token');
        if (accessToken) {
            showActivities(accessToken);
        }
    }
});

async function exchangeCodeForToken(authCode) {
    const CLIENT_SECRET = 'c5f5d0052147d24d9d483eaabab54962c99bf3e7'; // Replace with your Client Secret
    
    try {
        const response = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: authCode,
                grant_type: 'authorization_code'
            })
        });
        
        const data = await response.json();
        
        if (data.access_token) {
            // Store the token
            localStorage.setItem('strava_access_token', data.access_token);
            
            // Remove the code from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show activities
            showActivities(data.access_token);
        } else {
            alert('Failed to get access token');
        }
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        alert('Error connecting to Strava');
    }
}

async function showActivities(accessToken) {
    try {
        const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const activities = await response.json();
        
        // Hide login, show activities
        loginSection.style.display = 'none';
        activitiesSection.style.display = 'block';
        
        // Display activities
        activitiesList.innerHTML = '';
        activities.forEach(activity => {
            const activityDiv = document.createElement('div');
            activityDiv.className = 'activity';
            
            const distance = (activity.distance / 1000).toFixed(2); // Convert to km
            const date = new Date(activity.start_date).toLocaleDateString();
            
            activityDiv.innerHTML = `
                <h3>${activity.name}</h3>
                <p><strong>Type:</strong> ${activity.type}</p>
                <p><strong>Distance:</strong> ${distance} km</p>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Moving Time:</strong> ${Math.floor(activity.moving_time / 60)} minutes</p>
            `;
            
            activitiesList.appendChild(activityDiv);
        });
        
    } catch (error) {
        console.error('Error fetching activities:', error);
        alert('Error loading activities');
    }
}

function logout() {
    localStorage.removeItem('strava_access_token');
    loginSection.style.display = 'block';
    activitiesSection.style.display = 'none';
}