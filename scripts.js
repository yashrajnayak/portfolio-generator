class PortfolioGenerator {
    constructor() {
        this.form = document.getElementById('portfolioForm');
        this.previewSection = document.getElementById('previewSection');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.githubInput = document.getElementById('github');
        this.linkedinInput = document.getElementById('linkedin');
        this.repoNameElement = document.getElementById('repoName');
        this.portfolioUrlElement = document.getElementById('portfolioUrl');

        this.loadingStates = {
            github: false,
            generating: false
        };
        
        // Clear any previous errors when inputs change
        this.githubInput.addEventListener('input', () => this.clearError('github-error'));
        this.linkedinInput.addEventListener('input', () => {
            this.clearError('linkedin-error');
            this.validateLinkedIn(this.linkedinInput.value);
        });

        this.bindEvents();
    }

    bindEvents() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.downloadBtn.addEventListener('click', () => this.generateFiles());
    }

    showLoading(type) {
        this.loadingStates[type] = true;
        if (type === 'github') {
            const submitBtn = this.form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
        }
    }

    hideLoading(type) {
        this.loadingStates[type] = false;
        if (type === 'github') {
            const submitBtn = this.form.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Generate Portfolio';
        }
    }

    clearError(elementId) {
        const errorElement = document.getElementById(elementId);
        errorElement.textContent = '';
    }

    validateLinkedIn(url) {
        const errorElement = document.getElementById('linkedin-error');
        if (url && !url.match(/^https:\/\/[w]{0,3}\.?linkedin\.com\/.*$/)) {
            errorElement.textContent = 'Please enter a valid LinkedIn URL';
            return false;
        }
        return true;
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const github = this.githubInput.value.trim();
        const linkedin = this.linkedinInput.value.trim();

        if (!this.validateInputs(github, linkedin)) return;

        try {
            this.showLoading('github');
            const userData = await this.fetchGitHubData(github);
            const repos = await this.fetchGitHubRepos(github);
            
            // Cache the API responses
            sessionStorage.setItem(`gh_user_${github}`, JSON.stringify(userData));
            sessionStorage.setItem(`gh_repos_${github}`, JSON.stringify(repos));
            
            this.updatePreview(userData, repos, linkedin);
            this.previewSection.classList.remove('hidden');
            this.repoNameElement.textContent = `${github}.github.io`;
            this.portfolioUrlElement.textContent = `https://${github}.github.io`;
        } catch (error) {
            this.showError('github-error', error.message || 'Failed to fetch GitHub data. Please check your username.');
        } finally {
            this.hideLoading('github');
        }
    }

    validateInputs(github, linkedin) {
        let isValid = true;

        if (!github) {
            this.showError('github-error', 'GitHub username is required');
            isValid = false;
        }

        // LinkedIn is now optional, only validate format if provided
        if (linkedin && !linkedin.match(/^https:\/\/[w]{0,3}\.?linkedin\.com\/.*$/)) {
            this.showError('linkedin-error', 'Please enter a valid LinkedIn URL');
            isValid = false;
        }

        return isValid;
    }

    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        errorElement.textContent = message;
    }

    async fetchGitHubData(username) {
        // Check cache first
        const cached = sessionStorage.getItem(`gh_user_${username}`);
        if (cached) {
            return JSON.parse(cached);
        }

        const response = await fetch(`https://api.github.com/users/${username}`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to fetch user info');
        }
        return response.json();
    }

    async fetchGitHubRepos(username) {
        // Check cache first
        const cached = sessionStorage.getItem(`gh_repos_${username}`);
        if (cached) {
            return JSON.parse(cached);
        }

        const response = await fetch(`https://api.github.com/users/${username}/repos?per_page=100`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to fetch repositories');
        }
        const allRepos = await response.json();
        
        // Sort by stars (most stars first) and take the first 6
        return allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);
    }

    updatePreview(userData, repos, linkedin) {
        const previewFrame = document.getElementById('previewFrame');
        const portfolioHTML = this.generatePortfolioHTML(userData, repos, linkedin);
        
        previewFrame.srcdoc = portfolioHTML;

        // Add message listener for iframe height
        window.addEventListener('message', (event) => {
            if (event.data.type === 'resize') {
                previewFrame.style.height = `${event.data.height}px`;
            }
        });

        // Ensure scripts run after iframe loads
        previewFrame.addEventListener('load', () => {
            // Force the iframe to execute scripts by directly injecting and running the script
            const iframeDocument = previewFrame.contentDocument || previewFrame.contentWindow.document;
            const iframeWindow = previewFrame.contentWindow;
            
            const scriptElement = iframeDocument.createElement('script');
            scriptElement.textContent = `
                // Initialize theme switcher
                const themeSwitch = document.querySelector('.theme-switch');
                const root = document.documentElement;
                
                // Set initial theme (using parent window's localStorage)
                const savedTheme = window.parent.localStorage.getItem('theme') || 'light';
                root.setAttribute('data-theme', savedTheme);
                
                // Add event listener for theme switching
                themeSwitch.addEventListener('click', function() {
                    const currentTheme = root.getAttribute('data-theme');
                    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                    
                    root.setAttribute('data-theme', newTheme);
                    window.parent.localStorage.setItem('theme', newTheme);
                });
                
                // Initialize projects display
                const projectsContainer = document.getElementById('projects');
                const username = '${this.githubInput.value.trim()}';
                
                try {
                    // Get the repos data from the stringified JSON in the parent
                    const cachedReposJSON = '${JSON.stringify(repos).replace(/'/g, "\\'")}';
                    const cachedRepos = JSON.parse(cachedReposJSON);
                    
                    // Sort by stars and filter
                    const sortedRepos = [...cachedRepos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);
                    
                    // Clear loading message
                    projectsContainer.innerHTML = '';
                    
                    // Filter out only the portfolio repository
                    const filteredRepos = sortedRepos.filter(repo => 
                        repo.name !== \`\${username}.github.io\`
                    );
                    
                    // Add projects with staggered animation
                    filteredRepos.forEach((repo, index) => {
                        const card = document.createElement('div');
                        card.className = 'project-card';
                        card.style.animationDelay = \`\${index * 0.1}s\`;
                        
                        card.innerHTML = \`
                            <h3>\${repo.name}</h3>
                            \${repo.description ? \`<p>\${repo.description}</p>\` : '<p>No description available</p>'}
                            <div class="project-links">
                                <a href="\${repo.html_url}" target="_blank" rel="noopener noreferrer">View Repository</a>
                                \${repo.homepage ? \`<a href="\${repo.homepage}" target="_blank" rel="noopener noreferrer">Live Demo</a>\` : ''}
                            </div>
                        \`;
                        
                        projectsContainer.appendChild(card);
                    });
                    
                    if (filteredRepos.length === 0) {
                        projectsContainer.innerHTML = '<div class="loading">No projects to display.</div>';
                    }
                    
                    // Add "See all repositories" link
                    const seeAllLink = document.createElement('div');
                    seeAllLink.className = 'see-all-repos';
                    seeAllLink.innerHTML = \`<a href="https://github.com/\${username}?tab=repositories" target="_blank" rel="noopener noreferrer">See all repositories →</a>\`;
                    projectsContainer.parentNode.insertBefore(seeAllLink, projectsContainer.nextSibling);
                } catch (error) {
                    projectsContainer.innerHTML = '<div class="loading">Failed to load projects. Please try again later.</div>';
                    console.error('Error displaying GitHub projects:', error);
                }
            `;
            
            iframeDocument.body.appendChild(scriptElement);
        });
    }

    generatePortfolioHTML(userData, repos, linkedin) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Developer Portfolio - ${userData.name || userData.login}">
    <title>${userData.name || userData.login} - Developer Portfolio</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z'/></svg>">
    <style>
${this.getPortfolioStyles()}
    </style>
    <script>
        // Add resize observer to update parent
        window.addEventListener('load', function() {
            const resizeObserver = new ResizeObserver(entries => {
                const height = document.documentElement.scrollHeight;
                window.parent.postMessage({ type: 'resize', height }, '*');
            });
            resizeObserver.observe(document.body);
        });
    </script>
</head>
<body>
    <button class="theme-switch" aria-label="Toggle theme">
        <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    </button>

    <div class="container">
        <header>
            <img src="${userData.avatar_url}" alt="Profile" class="profile-img">
            <h1>Hi, I'm ${userData.name || userData.login} 👋</h1>
            <div class="social-links">
                ${linkedin ? `<a href="${linkedin}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                        <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
                    </svg>
                    LinkedIn
                </a>` : ''}
                <a href="${userData.html_url}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                    GitHub
                </a>
            </div>
        </header>
        
        <div id="projects" class="projects">
            <div class="loading">Loading projects...</div>
        </div>
    </div>
    
    <script>
${this.getPortfolioScripts()}
    </script>
</body>
</html>
        `;
    }

    generateProjectsHTML(repos) {
        if (!repos || repos.length === 0) {
            return '<div class="loading">No projects to display.</div>';
        }

        // Filter out username.github.io repository if it exists
        const username = this.githubInput.value.trim();
        const filteredRepos = repos.filter(repo => 
            repo.name !== `${username}.github.io`
        );

        if (filteredRepos.length === 0) {
            return '<div class="loading">No projects to display.</div>';
        }

        const projectsHTML = filteredRepos.map((repo, index) => `
            <div class="project-card" style="animation-delay: ${index * 0.1}s">
                <h3>${repo.name}</h3>
                ${repo.description ? `<p>${repo.description}</p>` : '<p>No description available</p>'}
                <div class="project-links">
                    <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">View Repository</a>
                    ${repo.homepage ? `<a href="${repo.homepage}" target="_blank" rel="noopener noreferrer">Live Demo</a>` : ''}
                </div>
            </div>
        `).join('');

        return projectsHTML;
    }

    getPortfolioStyles() {
        return `/* Modern CSS Reset */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

/* Custom Properties */
:root {
    --primary-color: #2563eb;
    --secondary-color: #1e293b;
    --background-color: #f8fafc;
    --card-background: #ffffff;
    --text-color: #1e293b;
    --text-muted: #64748b;
    --border-radius: 1rem;
    --transition: all 0.3s ease;
}

/* Dark mode */
:root[data-theme="dark"] {
    --background-color: #0f172a;
    --card-background: #1e293b;
    --text-color: #f1f5f9;
    --text-muted: #94a3b8;
}

/* Base Styles */
body {
    background-color: var(--background-color);
    color: var(--text-color);
    line-height: 1.6;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: var(--transition);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Container */
.container {
    width: min(1200px, 90%);
    margin: 0 auto;
    padding: clamp(1rem, 5vw, 3rem);
    flex: 1;
}

/* Theme Switcher */
.theme-switch {
    position: fixed;
    top: 1rem;
    left: 1rem;
    background: var(--card-background);
    border: none;
    color: var (--text-color);
    padding: 0.75rem;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--transition);
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.theme-switch:hover {
    transform: rotate(15deg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.theme-switch svg {
    width: 1.5rem;
    height: 1.5rem;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-switch .sun-icon {
    opacity: 1;
    transform: scale(1) rotate(0);
}

.theme-switch .moon-icon {
    position: absolute;
    opacity: 0;
    transform: scale(0) rotate(-90deg);
}

[data-theme="dark"] .theme-switch .sun-icon {
    opacity: 0;
    transform: scale(0) rotate(90deg);
}

[data-theme="dark"] .theme-switch .moon-icon {
    opacity: 1;
    transform: scale(1) rotate(0);
}

/* Header Section */
header {
    text-align: center;
    margin-bottom: clamp(2rem, 8vw, 5rem);
    animation: fadeIn 1s ease;
}

.profile-img {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    margin-bottom: 1.5rem;
    border: 4px solid var (--card-background);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
    transition: var(--transition);
}

.profile-img:hover {
    transform: scale(1.05);
}

h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    margin-bottom: 1rem;
    line-height: 1.2;
}

/* Social Links */
.social-links {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
}

.social-links a {
    color: var(--text-color);
    text-decoration: none;
    padding: 0.75rem 1.5rem;
    border-radius: var(--border-radius);
    background-color: var(--card-background);
    transition: var(--transition);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.social-links a:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1);
}

.social-links a svg {
    width: 1.25rem;
    height: 1.25rem;
}

/* Projects Grid */
.projects {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: clamp(1rem, 3vw, 2rem);
    margin-top: 2rem;
}

.project-card {
    background-color: var(--card-background);
    border-radius: var(--border-radius);
    padding: 1.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    transition: var(--transition);
    animation: slideUp 0.5s ease;
    animation-fill-mode: both;
}

.project-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1);
}

.project-card h3 {
    margin-bottom: 0.75rem;
    color: var(--primary-color);
}

.project-card p {
    color: var(--text-muted);
    margin-bottom: 1.25rem;
}

.project-links {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.project-links a {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;
    transition: var(--transition);
}

.project-links a:hover {
    text-decoration: underline;
    opacity: 0.9;
}

/* Loading State */
.loading {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
}

/* Footer */
.footer {
    background-color: var(--card-background);
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    padding: 1.5rem 0;
    margin-top: auto;
    text-align: center;
}

.footer-content {
    width: min(1200px, 90%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text-muted);
}

.footer-content a {
    color: var(--primary-color);
    text-decoration: none;
    transition: opacity 0.2s;
}

.footer-content a:hover {
    opacity: 0.8;
    text-decoration: underline;
}

@media (min-width: 640px) {
    .footer-content {
        flex-direction: row;
        justify-content: center;
        gap: 2rem;
    }
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* See All Repositories Link */
.see-all-repos {
    text-align: center;
    margin-top: 2rem;
    animation: fadeIn 0.5s ease;
}

.see-all-repos a {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;
    padding: 0.75rem 1.5rem;
    border-radius: var(--border-radius);
    background-color: var(--card-background);
    transition: var(--transition);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    display: inline-block;
}

.see-all-repos a:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1);
}

/* Responsive Design */
@media (max-width: 768px) {
    .container {
        width: 95%;
        padding: 1rem;
    }
    
    .profile-img {
        width: 140px;
        height: 140px;
    }
    
    .social-links {
        flex-direction: column;
        align-items: stretch;
    }
    
    .social-links a {
        text-align: center;
        justify-content: center;
    }
}`;
    }

    getPortfolioScripts() {
        const username = this.githubInput.value.trim();
        // Get the cached repos data
        const cachedRepos = JSON.parse(sessionStorage.getItem(`gh_repos_${username}`)) || [];
        
        // Sort by stars (most stars first) and take the first 6
        const sortedRepos = [...cachedRepos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);
        
        return `// Theme Switcher
document.addEventListener('DOMContentLoaded', function() {
    const themeSwitch = document.querySelector('.theme-switch');
    const root = document.documentElement;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);

    themeSwitch.addEventListener('click', () => {
        const currentTheme = root.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        root.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Display GitHub projects (using pre-fetched data for preview)
    displayGitHubProjects();
});

// Display GitHub projects (using pre-fetched data for preview)
function displayGitHubProjects() {
    const projectsContainer = document.getElementById('projects');
    const username = '${username}';
    
    try {
        // Use the pre-fetched repos data (already sorted by stars)
        const repos = ${JSON.stringify(sortedRepos)};
        
        // Clear loading message
        projectsContainer.innerHTML = '';
        
        // Filter out only the portfolio repository
        const filteredRepos = repos.filter(repo => 
            repo.name !== \`\${username}.github.io\`
        );
        
        // Add projects with staggered animation
        filteredRepos.forEach((repo, index) => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.style.animationDelay = \`\${index * 0.1}s\`;
            
            card.innerHTML = \`
                <h3>\${repo.name}</h3>
                \${repo.description ? \`<p>\${repo.description}</p>\` : '<p>No description available</p>'}
                <div class="project-links">
                    <a href="\${repo.html_url}" target="_blank" rel="noopener noreferrer">View Repository</a>
                    \${repo.homepage ? \`<a href="\${repo.homepage}" target="_blank" rel="noopener noreferrer">Live Demo</a>\` : ''}
                </div>
            \`;
            
            projectsContainer.appendChild(card);
        });

        if (filteredRepos.length === 0) {
            projectsContainer.innerHTML = '<div class="loading">No projects to display.</div>';
        }
        
        // Add "See all repositories" link
        const seeAllLink = document.createElement('div');
        seeAllLink.className = 'see-all-repos';
        seeAllLink.innerHTML = \`<a href="https://github.com/\${username}?tab=repositories" target="_blank" rel="noopener noreferrer">See all repositories →</a>\`;
        projectsContainer.parentNode.insertBefore(seeAllLink, projectsContainer.nextSibling);
    } catch (error) {
        projectsContainer.innerHTML = '<div class="loading">Failed to load projects. Please try again later.</div>';
        console.error('Error displaying GitHub projects:', error);
    }
}

// For the actual downloaded portfolio, we'll use the fetch API
async function fetchGitHubProjects() {
    const projectsContainer = document.getElementById('projects');
    const username = '${username}';
    
    try {
        const response = await fetch(\`https://api.github.com/users/\${username}/repos?per_page=100\`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const allRepos = await response.json();
        
        // Sort by stars (most stars first) and take the first 6
        const repos = allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);
        
        // Clear loading message
        projectsContainer.innerHTML = '';
        
        // Filter out only the portfolio repository
        const filteredRepos = repos.filter(repo => 
            repo.name !== \`\${username}.github.io\`
        );
        
        // Add projects with staggered animation
        filteredRepos.forEach((repo, index) => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.style.animationDelay = \`\${index * 0.1}s\`;
            
            card.innerHTML = \`
                <h3>\${repo.name}</h3>
                \${repo.description ? \`<p>\${repo.description}</p>\` : '<p>No description available</p>'}
                <div class="project-links">
                    <a href="\${repo.html_url}" target="_blank" rel="noopener noreferrer">View Repository</a>
                    \${repo.homepage ? \`<a href="\${repo.homepage}" target="_blank" rel="noopener noreferrer">Live Demo</a>\` : ''}
                </div>
            \`;
            
            projectsContainer.appendChild(card);
        });

        if (filteredRepos.length === 0) {
            projectsContainer.innerHTML = '<div class="loading">No projects to display.</div>';
        }
        
        // Add "See all repositories" link
        const seeAllLink = document.createElement('div');
        seeAllLink.className = 'see-all-repos';
        seeAllLink.innerHTML = \`<a href="https://github.com/\${username}?tab=repositories" target="_blank" rel="noopener noreferrer">See all repositories →</a>\`;
        projectsContainer.parentNode.insertBefore(seeAllLink, projectsContainer.nextSibling);
    } catch (error) {
        projectsContainer.innerHTML = '<div class="loading">Failed to load projects. Please try again later.</div>';
        console.error('Error fetching GitHub projects:', error);
    }
}`;
    }

    async generateFiles() {
        const zip = new JSZip();
        
        // Get the preview frame content
        const previewFrame = document.getElementById('previewFrame');
        
        // Add CSS file
        zip.file('styles.css', this.getPortfolioStyles());
        
        // Add JS file - replace the preview-specific code with the fetch version for the downloaded file
        const jsContent = `// Theme Switcher
document.addEventListener('DOMContentLoaded', function() {
    const themeSwitch = document.querySelector('.theme-switch');
    const root = document.documentElement;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);

    themeSwitch.addEventListener('click', () => {
        const currentTheme = root.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        root.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Fetch GitHub projects
    fetchGitHubProjects();
});

// Fetch GitHub projects from GitHub API
async function fetchGitHubProjects() {
    const projectsContainer = document.getElementById('projects');
    const username = '${this.githubInput.value.trim()}';
    
    try {
        const response = await fetch(\`https://api.github.com/users/\${username}/repos?per_page=100\`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const allRepos = await response.json();
        
        // Sort by stars (most stars first) and take the first 6
        const repos = allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);
        
        // Clear loading message
        projectsContainer.innerHTML = '';
        
        // Filter out only the portfolio repository
        const filteredRepos = repos.filter(repo => 
            repo.name !== \`\${username}.github.io\`
        );
        
        // Add projects with staggered animation
        filteredRepos.forEach((repo, index) => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.style.animationDelay = \`\${index * 0.1}s\`;
            
            card.innerHTML = \`
                <h3>\${repo.name}</h3>
                \${repo.description ? \`<p>\${repo.description}</p>\` : '<p>No description available</p>'}
                <div class="project-links">
                    <a href="\${repo.html_url}" target="_blank" rel="noopener noreferrer">View Repository</a>
                    \${repo.homepage ? \`<a href="\${repo.homepage}" target="_blank" rel="noopener noreferrer">Live Demo</a>\` : ''}
                </div>
            \`;
            
            projectsContainer.appendChild(card);
        });

        if (filteredRepos.length === 0) {
            projectsContainer.innerHTML = '<div class="loading">No projects to display.</div>';
        }
        
        // Add "See all repositories" link
        const seeAllLink = document.createElement('div');
        seeAllLink.className = 'see-all-repos';
        seeAllLink.innerHTML = \`<a href="https://github.com/\${username}?tab=repositories" target="_blank" rel="noopener noreferrer">See all repositories →</a>\`;
        projectsContainer.parentNode.insertBefore(seeAllLink, projectsContainer.nextSibling);
    } catch (error) {
        projectsContainer.innerHTML = '<div class="loading">Failed to load projects. Please try again later.</div>';
        console.error('Error fetching GitHub projects:', error);
    }
}`;
        
        zip.file('scripts.js', jsContent);
        
        // Add HTML file - for the downloaded version, use external CSS and JS files
        const userData = JSON.parse(sessionStorage.getItem(`gh_user_${this.githubInput.value.trim()}`));
        const repos = JSON.parse(sessionStorage.getItem(`gh_repos_${this.githubInput.value.trim()}`));
        const linkedin = this.linkedinInput.value.trim();
        
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Developer Portfolio - ${userData.name || userData.login}">
    <title>${userData.name || userData.login} - Developer Portfolio</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z'/></svg>">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <button class="theme-switch" aria-label="Toggle theme">
        <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    </button>

    <div class="container">
        <header>
            <img src="${userData.avatar_url}" alt="Profile" class="profile-img">
            <h1>Hi, I'm ${userData.name || userData.login} 👋</h1>
            <div class="social-links">
                ${linkedin ? `<a href="${linkedin}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                        <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
                    </svg>
                    LinkedIn
                </a>` : ''}
                <a href="${userData.html_url}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                    GitHub
                </a>
            </div>
        </header>
        
        <div id="projects" class="projects">
            <div class="loading">Loading projects...</div>
        </div>
    </div>
    
    <script src="scripts.js"></script>
</body>
</html>`;
        
        zip.file('index.html', htmlContent);

        // Add README.md
        zip.file('README.md', this.generateReadme(userData.login));

        // Generate the zip file
        const blob = await zip.generateAsync({type: 'blob'});
        
        // Create download link
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'portfolio.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
    }

    generateReadme(username) {
        return `A minimalist developer portfolio built using https://portfoilio-generator.netlify.app

## Features

- 🌓 Dark/Light mode with smooth transitions
- 📱 Fully responsive design
- 🚀 Dynamic GitHub projects integration
- 🔗 Professional links (GitHub, LinkedIn)
- ⚡ Fast and lightweight`;
    }
}

// Initialize the portfolio generator when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PortfolioGenerator();
    
    // Check if URL contains a GitHub username for direct portfolio generation
    const pathSegments = window.location.pathname.split('/');
    const potentialUsername = pathSegments[pathSegments.length - 1];
    
    // If the last segment isn't empty and isn't one of our own files
    if (potentialUsername && 
        !potentialUsername.includes('.') && 
        potentialUsername !== 'portfolio-generator') {
        // Auto-fill and submit the form
        document.getElementById('github').value = potentialUsername;
        document.getElementById('portfolioForm').dispatchEvent(new Event('submit'));
    }
});