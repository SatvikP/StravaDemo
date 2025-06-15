// Your Strava app credentials
const CLIENT_ID = '164066'; // Replace with your actual Client ID
const REDIRECT_URI = 'https://stravademo.netlify.app/strava-app.html';
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

// Define common running distances in meters
const RUNNING_DISTANCES = {
    '5K': { min: 4900, max: 5100, name: '5K' },
    '10K': { min: 9900, max: 10100, name: '10K' },
    'Half Marathon': { min: 21000, max: 21200, name: 'Half Marathon' },
    'Marathon': { min: 42100, max: 42300, name: 'Marathon' }
};

async function getBestTimeForDistance(athleteId, accessToken, isYou, distance) {
    try {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const endpoint = isYou 
            ? 'https://www.strava.com/api/v3/athlete/activities'
            : `https://www.strava.com/api/v3/athletes/${athleteId}/activities`;
            
        const response = await fetch(`${endpoint}?after=${Math.floor(threeMonthsAgo.getTime()/1000)}&per_page=200`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!response.ok) {
            console.log(`Could not fetch activities for athlete ${athleteId}`);
            return null;
        }
        
        const activities = await response.json();
        
        // Filter for running activities within the distance range
        const runningActivities = activities.filter(activity => 
            activity.type === 'Run' && 
            activity.distance >= distance.min && 
            activity.distance <= distance.max
        );
        
        if (runningActivities.length === 0) return null;
        
        // Find the fastest time
        const bestActivity = runningActivities.reduce((best, current) => 
            current.elapsed_time < best.elapsed_time ? current : best
        );
        
        return bestActivity;
        
    } catch (error) {
        console.log(`Error fetching activities for athlete ${athleteId}:`, error);
        return null;
    }
}

async function getFollowingPRsLeaderboard(accessToken) {
    try {
        // Get your own data first
        const myProfile = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const myData = await myProfile.json();
        
        // Get your following list
        const followingResponse = await fetch('https://www.strava.com/api/v3/athlete/following?per_page=200', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const following = await followingResponse.json();
        
        console.log(`Found ${following.length} athletes you follow`);
        
        // Get PRs for all distances
        const leaderboard = {};
        
        // Initialize leaderboard for each distance
        Object.keys(RUNNING_DISTANCES).forEach(distance => {
            leaderboard[distance] = [];
        });
        
        // Add your own data
        for (const [distance, range] of Object.entries(RUNNING_DISTANCES)) {
            const bestTime = await getBestTimeForDistance(myData.id, accessToken, true, range);
            if (bestTime) {
                leaderboard[distance].push({
                    athlete: myData,
                    bestTime: bestTime.elapsed_time,
                    activity: bestTime,
                    isYou: true
                });
            }
        }
        
        // Add followers' data
        for (let athlete of following) {
            for (const [distance, range] of Object.entries(RUNNING_DISTANCES)) {
                const bestTime = await getBestTimeForDistance(athlete.id, accessToken, false, range);
                if (bestTime) {
                    leaderboard[distance].push({
                        athlete: athlete,
                        bestTime: bestTime.elapsed_time,
                        activity: bestTime,
                        isYou: false
                    });
                }
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Sort each distance's leaderboard by best time
        Object.keys(leaderboard).forEach(distance => {
            leaderboard[distance].sort((a, b) => a.bestTime - b.bestTime);
        });
        
        return leaderboard;
        
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return {};
    }
}

function displayPRsLeaderboard(leaderboard) {
    const activitiesList = document.getElementById('activities-list');
    
    activitiesList.innerHTML = '<h2>Running PRs Leaderboard - Last 3 Months</h2>';
    
    let hasAnyPRs = false;
    
    for (const [distance, entries] of Object.entries(leaderboard)) {
        if (entries.length > 0) {
            hasAnyPRs = true;
            activitiesList.innerHTML += `<h3>${distance}</h3>`;
            
            entries.forEach((entry, index) => {
                const minutes = Math.floor(entry.bestTime / 60);
                const seconds = entry.bestTime % 60;
                const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                const distance = (entry.activity.distance / 1000).toFixed(2);
                const date = new Date(entry.activity.start_date).toLocaleDateString();
                
                const entryDiv = document.createElement('div');
                entryDiv.className = 'activity';
                entryDiv.style.backgroundColor = entry.isYou ? '#e8f5e8' : '#f9f9f9';
                entryDiv.style.border = entry.isYou ? '2px solid #4CAF50' : '1px solid #ddd';
                
                entryDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3>#${index + 1} ${entry.athlete.firstname} ${entry.athlete.lastname} ${entry.isYou ? '(YOU)' : ''}</h3>
                            <p><strong>Time:</strong> ${timeString}</p>
                            <p><strong>Distance:</strong> ${distance} km</p>
                            <p><strong>Date:</strong> ${date}</p>
                            <p><strong>Activity:</strong> ${entry.activity.name}</p>
                        </div>
                        <div style="font-size: 24px; font-weight: bold; color: #666;">
                            ${timeString}
                        </div>
                    </div>
                `;
                
                activitiesList.appendChild(entryDiv);
            });
        }
    }
    
    if (!hasAnyPRs) {
        activitiesList.innerHTML += '<p>No running PRs found in your network for the last 3 months.</p>';
    }
}

// Update the showActivities function to show PRs leaderboard
async function showActivities(accessToken) {
    try {
        // Hide login, show activities
        loginSection.style.display = 'none';
        activitiesSection.style.display = 'block';
        
        // Show loading message
        activitiesList.innerHTML = '<p>Loading running PRs leaderboard from your network... This may take a minute.</p>';
        
        // Get and display leaderboard
        const leaderboard = await getFollowingPRsLeaderboard(accessToken);
        displayPRsLeaderboard(leaderboard);
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        activitiesList.innerHTML = '<p>Error loading leaderboard. Check console for details.</p>';
    }
}

function logout() {
    localStorage.removeItem('strava_access_token');
    loginSection.style.display = 'block';
    activitiesSection.style.display = 'none';
}

// Add this function to get network leaderboard
async function getFollowing10KLeaderboard(accessToken) {
    try {
        // Get your own data first
        const myProfile = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const myData = await myProfile.json();
        
        // Get your following list
        const followingResponse = await fetch('https://www.strava.com/api/v3/athlete/following?per_page=200', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const following = await followingResponse.json();
        
        console.log(`Found ${following.length} athletes you follow`);
        
        // Get 10K times for you and your network
        const leaderboard = [];
        
        // Add your own data
        const myBest10K = await getBest10KTime(myData.id, accessToken, true); // true = it's you
        if (myBest10K) {
            leaderboard.push({
                athlete: myData,
                bestTime: myBest10K.elapsed_time,
                activity: myBest10K,
                isYou: true
            });
        }
        
        // Add followers' data
        for (let athlete of following) {
            const best10K = await getBest10KTime(athlete.id, accessToken, false);
            if (best10K) {
                leaderboard.push({
                    athlete: athlete,
                    bestTime: best10K.elapsed_time,
                    activity: best10K,
                    isYou: false
                });
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Sort by best time
        leaderboard.sort((a, b) => a.bestTime - b.bestTime);
        
        return leaderboard;
        
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

async function getBest10KTime(athleteId, accessToken, isYou) {
    try {
        // Get activities from last 3 months
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        const endpoint = isYou 
            ? 'https://www.strava.com/api/v3/athlete/activities'
            : `https://www.strava.com/api/v3/athletes/${athleteId}/activities`;
            
        const response = await fetch(`${endpoint}?after=${Math.floor(threeMonthsAgo.getTime()/1000)}&per_page=200`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!response.ok) {
            console.log(`Could not fetch activities for athlete ${athleteId}`);
            return null;
        }
        
        const activities = await response.json();
        
        // Filter for running activities around 10K (9-11K to catch different routes)
        const runningActivities = activities.filter(activity => 
            activity.type === 'Run' && 
            activity.distance >= 9000 && 
            activity.distance <= 11000
        );
        
        if (runningActivities.length === 0) return null;
        
        // Find the fastest 10K
        const bestActivity = runningActivities.reduce((best, current) => 
            current.elapsed_time < best.elapsed_time ? current : best
        );
        
        return bestActivity;
        
    } catch (error) {
        console.log(`Error fetching activities for athlete ${athleteId}:`, error);
        return null;
    }
}

function displayLeaderboard(leaderboard) {
    const activitiesList = document.getElementById('activities-list');
    
    activitiesList.innerHTML = '<h2>10K Leaderboard - Last 12 Months</h2>';
    
    if (leaderboard.length === 0) {
        activitiesList.innerHTML += '<p>No 10K activities found in your network.</p>';
        return;
    }
    
    leaderboard.forEach((entry, index) => {
        const minutes = Math.floor(entry.bestTime / 60);
        const seconds = entry.bestTime % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const distance = (entry.activity.distance / 1000).toFixed(2);
        const date = new Date(entry.activity.start_date).toLocaleDateString();
        
        const entryDiv = document.createElement('div');
        entryDiv.className = 'activity';
        entryDiv.style.backgroundColor = entry.isYou ? '#e8f5e8' : '#f9f9f9';
        entryDiv.style.border = entry.isYou ? '2px solid #4CAF50' : '1px solid #ddd';
        
        entryDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3>#${index + 1} ${entry.athlete.firstname} ${entry.athlete.lastname} ${entry.isYou ? '(YOU)' : ''}</h3>
                    <p><strong>Time:</strong> ${timeString}</p>
                    <p><strong>Distance:</strong> ${distance} km</p>
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Activity:</strong> ${entry.activity.name}</p>
                </div>
                <div style="font-size: 24px; font-weight: bold; color: #666;">
                    ${timeString}
                </div>
            </div>
        `;
        
        activitiesList.appendChild(entryDiv);
    });
}

// Update the showActivities function to show leaderboard instead
async function showActivities(accessToken) {
    try {
        // Hide login, show activities
        loginSection.style.display = 'none';
        activitiesSection.style.display = 'block';
        
        // Show loading message
        activitiesList.innerHTML = '<p>Loading 10K leaderboard from your network... This may take a minute.</p>';
        
        // Get and display leaderboard
        const leaderboard = await getFollowing10KLeaderboard(accessToken);
        displayLeaderboard(leaderboard);
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        activitiesList.innerHTML = '<p>Error loading leaderboard. Check console for details.</p>';
    }
}
