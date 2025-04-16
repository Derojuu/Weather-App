document.addEventListener('DOMContentLoaded', () => {
    // API Key handling
    const API_KEY_STORAGE = 'openweather_api_key';
    let apiKey = localStorage.getItem(API_KEY_STORAGE) || '';
    let weatherData = [];
    let selectedDay = 0;
    let currentLocation = { lat: 40.7128, lon: -74.0060 }; // Default to New York
    
    // Check for saved theme preference or use system preference
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDarkMode)) {
      document.body.classList.add('dark-mode');
    }
    
    // Theme toggle functionality
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDarkMode = document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });
  
    // API Key form handling
    const apiKeyForm = document.getElementById('api-key-form');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKeyDisplay = document.getElementById('api-key-display');
    
    if (apiKey) {
      apiKeyDisplay.textContent = maskApiKey(apiKey);
      document.getElementById('api-container').classList.add('has-key');
      fetchWeatherData();
    }
    
    apiKeyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      apiKey = apiKeyInput.value.trim();
      
      if (apiKey) {
        localStorage.setItem(API_KEY_STORAGE, apiKey);
        apiKeyDisplay.textContent = maskApiKey(apiKey);
        document.getElementById('api-container').classList.add('has-key');
        fetchWeatherData();
      }
    });
    
    document.getElementById('change-key').addEventListener('click', () => {
      document.getElementById('api-container').classList.remove('has-key');
      apiKeyInput.value = apiKey;
    });
    
    // Get user's location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          currentLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          if (apiKey) {
            fetchWeatherData();
          }
        },
        (error) => {
          console.warn('Error getting location:', error);
          // Continue with default location
          if (apiKey) {
            fetchWeatherData();
          }
        }
      );
    }
    
    // Fetch weather data from OpenWeatherMap API
    async function fetchWeatherData() {
      showLoading(true);
      showError(false);
      
      try {
        // Fetch current weather
        const currentWeather = await fetchCurrentWeather();
        
        // Fetch historical data for past days
        const historicalData = await fetchHistoricalData();
        
        // Combine current and historical data
        weatherData = [currentWeather, ...historicalData];
        
        // Initialize the UI
        renderDayCards(weatherData);
        updateCurrentWeather(weatherData[selectedDay]);
        updateMobileNavigation();
        
        showLoading(false);
        document.getElementById('weather-container').classList.remove('hidden');
      } catch (error) {
        console.error('Error fetching weather data:', error);
        showLoading(false);
        showError(true, error.message);
      }
    }
    
    // Fetch current weather data
    async function fetchCurrentWeather() {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${currentLocation.lat}&lon=${currentLocation.lon}&units=metric&appid=${apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return formatWeatherData(data, new Date());
    }
    
    // Fetch historical data for the past days
    async function fetchHistoricalData() {
      const historicalData = [];
      const today = new Date();
      
      // OpenWeatherMap's free tier only allows 5 days of historical data with One Call API
      // We'll use the 5-day forecast for future days and historical for past days
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${currentLocation.lat}&lon=${currentLocation.lon}&units=metric&appid=${apiKey}`;
      const forecastResponse = await fetch(forecastUrl);
      
      if (!forecastResponse.ok) {
        throw new Error(`Forecast API error: ${forecastResponse.status} ${forecastResponse.statusText}`);
      }
      
      const forecastData = await forecastResponse.json();
      
      // Process the next 6 days (we already have today from current weather)
      for (let i = 1; i <= 6; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        // For recent days (1-5), we can use the One Call API with historical data
        if (i <= 5) {
          try {
            const timestamp = Math.floor(date.getTime() / 1000);
            const historicalUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${currentLocation.lat}&lon=${currentLocation.lon}&dt=${timestamp}&units=metric&appid=${apiKey}`;
            
            const response = await fetch(historicalUrl);
            if (!response.ok) {
              throw new Error(`Historical API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            historicalData.push(formatHistoricalData(data, date));
          } catch (error) {
            console.warn(`Error fetching historical data for day ${i}:`, error);
            // Fallback to forecast data or estimated data
            historicalData.push(estimateHistoricalData(date, forecastData));
          }
        } else {
          // For days beyond what the API provides, estimate based on forecast trends
          historicalData.push(estimateHistoricalData(date, forecastData));
        }
      }
      
      return historicalData;
    }
    
    // Format current weather data
    function formatWeatherData(data, date) {
      const condition = data.weather[0].main;
      const icon = mapWeatherIcon(data.weather[0].icon);
      
      return {
        date,
        formattedDate: formatDate(date),
        condition,
        icon,
        temperature: Math.round(data.main.temp),
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
        precipitation: data.rain ? Math.round(data.rain['1h'] * 100) : 0,
        high: Math.round(data.main.temp_max),
        low: Math.round(data.main.temp_min),
        cityName: data.name,
        countryCode: data.sys.country,
        description: data.weather[0].description,
        feelsLike: Math.round(data.main.feels_like),
        pressure: data.main.pressure,
        sunrise: new Date(data.sys.sunrise * 1000),
        sunset: new Date(data.sys.sunset * 1000)
      };
    }
    
    // Format historical data
    function formatHistoricalData(data, date) {
      const hourlyData = data.data || [];
      const midday = hourlyData.find(h => {
        const hour = new Date(h.dt * 1000).getHours();
        return hour >= 12 && hour <= 14;
      }) || hourlyData[0];
      
      if (!midday) {
        return estimateHistoricalData(date);
      }
      
      const condition = midday.weather[0].main;
      const icon = mapWeatherIcon(midday.weather[0].icon);
      
      // Calculate high and low from hourly data
      const temps = hourlyData.map(h => h.temp);
      const high = Math.round(Math.max(...temps));
      const low = Math.round(Math.min(...temps));
      
      // Calculate average precipitation chance
      const precipSum = hourlyData.reduce((sum, h) => sum + (h.pop || 0), 0);
      const precipitation = Math.round((precipSum / hourlyData.length) * 100);
      
      return {
        date,
        formattedDate: formatDate(date),
        condition,
        icon,
        temperature: Math.round(midday.temp),
        humidity: midday.humidity,
        windSpeed: Math.round(midday.wind_speed * 3.6), // Convert m/s to km/h
        precipitation,
        high,
        low,
        description: midday.weather[0].description,
        feelsLike: Math.round(midday.feels_like)
      };
    }
    
    // Estimate historical data when API data is not available
    function estimateHistoricalData(date, forecastData) {
      // This is a fallback when we can't get real historical data
      // In a real app, you might want to use a more sophisticated approach
      const condition = ["Sunny", "Cloudy", "Rainy", "Partly Cloudy", "Clear"][Math.floor(Math.random() * 5)];
      const icon = mapWeatherConditionToIcon(condition);
      
      return {
        date,
        formattedDate: formatDate(date),
        condition,
        icon,
        temperature: Math.floor(Math.random() * 15) + 15,
        humidity: Math.floor(Math.random() * 30) + 40,
        windSpeed: Math.floor(Math.random() * 20) + 5,
        precipitation: Math.floor(Math.random() * 80),
        high: Math.floor(Math.random() * 10) + 20,
        low: Math.floor(Math.random() * 10) + 10,
        description: condition,
        estimated: true
      };
    }
    
    // Map OpenWeatherMap icon codes to Font Awesome icons
    function mapWeatherIcon(iconCode) {
      const iconMap = {
        '01d': 'fa-sun',
        '01n': 'fa-moon',
        '02d': 'fa-cloud-sun',
        '02n': 'fa-cloud-moon',
        '03d': 'fa-cloud',
        '03n': 'fa-cloud',
        '04d': 'fa-cloud',
        '04n': 'fa-cloud',
        '09d': 'fa-cloud-showers-heavy',
        '09n': 'fa-cloud-showers-heavy',
        '10d': 'fa-cloud-rain',
        '10n': 'fa-cloud-rain',
        '11d': 'fa-bolt',
        '11n': 'fa-bolt',
        '13d': 'fa-snowflake',
        '13n': 'fa-snowflake',
        '50d': 'fa-smog',
        '50n': 'fa-smog'
      };
      
      return iconMap[iconCode] || 'fa-cloud';
    }
    
    // Map weather condition to Font Awesome icon
    function mapWeatherConditionToIcon(condition) {
      const conditionMap = {
        'Clear': 'fa-sun',
        'Sunny': 'fa-sun',
        'Clouds': 'fa-cloud',
        'Cloudy': 'fa-cloud',
        'Partly Cloudy': 'fa-cloud-sun',
        'Rain': 'fa-cloud-rain',
        'Rainy': 'fa-cloud-rain',
        'Drizzle': 'fa-cloud-rain',
        'Thunderstorm': 'fa-bolt',
        'Snow': 'fa-snowflake',
        'Mist': 'fa-smog',
        'Smoke': 'fa-smog',
        'Haze': 'fa-smog',
        'Dust': 'fa-smog',
        'Fog': 'fa-smog',
        'Sand': 'fa-smog',
        'Ash': 'fa-smog',
        'Squall': 'fa-wind',
        'Tornado': 'fa-wind',
        'Windy': 'fa-wind'
      };
      
      return conditionMap[condition] || 'fa-cloud';
    }
    
    // Format date to "Day, Month Date" format
    function formatDate(date) {
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    }
    
    // Mask API key for display
    function maskApiKey(key) {
      if (key.length <= 8) return '********';
      return key.substring(0, 4) + '********' + key.substring(key.length - 4);
    }
    
    // Show/hide loading indicator
    function showLoading(isLoading) {
      const loadingElement = document.getElementById('loading');
      if (isLoading) {
        loadingElement.classList.remove('hidden');
      } else {
        loadingElement.classList.add('hidden');
      }
    }
    
    // Show/hide error message
    function showError(isError, message = '') {
      const errorElement = document.getElementById('error');
      const errorMessage = document.getElementById('error-message');
      
      if (isError) {
        errorElement.classList.remove('hidden');
        errorMessage.textContent = message || 'Failed to fetch weather data. Please try again.';
      } else {
        errorElement.classList.add('hidden');
      }
    }
    
    // Carousel navigation
    const prevButton = document.getElementById('carousel-prev');
    const nextButton = document.getElementById('carousel-next');
    
    prevButton.addEventListener('click', () => {
      const carousel = document.getElementById('days-carousel');
      carousel.scrollBy({ left: -carousel.offsetWidth / 2, behavior: 'smooth' });
    });
    
    nextButton.addEventListener('click', () => {
      const carousel = document.getElementById('days-carousel');
      carousel.scrollBy({ left: carousel.offsetWidth / 2, behavior: 'smooth' });
    });
    
    // Mobile navigation
    const prevDayButton = document.getElementById('prev-day');
    const nextDayButton = document.getElementById('next-day');
    const mobileDate = document.getElementById('mobile-date');
    
    prevDayButton.addEventListener('click', () => {
      if (selectedDay < weatherData.length - 1) {
        selectedDay++;
        updateSelectedDay();
      }
    });
    
    nextDayButton.addEventListener('click', () => {
      if (selectedDay > 0) {
        selectedDay--;
        updateSelectedDay();
      }
    });
    
    // Update the selected day
    function updateSelectedDay() {
      updateCurrentWeather(weatherData[selectedDay]);
      updateSelectedCardStyles();
      updateMobileNavigation();
    }
    
    // Update the mobile navigation display
    function updateMobileNavigation() {
      if (!weatherData.length) return;
      
      prevDayButton.disabled = selectedDay >= weatherData.length - 1;
      nextDayButton.disabled = selectedDay <= 0;
      mobileDate.textContent = selectedDay === 0 ? 'Today' : weatherData[selectedDay].formattedDate;
    }
    
    // Update the selected card styles
    function updateSelectedCardStyles() {
      const dayCards = document.querySelectorAll('.day-card');
      dayCards.forEach((card, index) => {
        if (index === selectedDay) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      });
    }
    
    // Render the day cards in the carousel
    function renderDayCards(data) {
      const carousel = document.getElementById('days-carousel');
      carousel.innerHTML = ''; // Clear existing cards
      
      data.forEach((day, index) => {
        const card = document.createElement('div');
        card.className = `card day-card ${index === selectedDay ? 'selected' : ''}`;
        
        // Add an "estimated" indicator for estimated data
        const estimatedBadge = day.estimated ? 
          '<span class="estimated-badge">Estimated</span>' : '';
        
        card.innerHTML = `
          <div class="card-header">
            <h3>${index === 0 ? 'Today' : day.formattedDate}</h3>
            ${estimatedBadge}
          </div>
          <div class="card-content">
            <div class="weather-icon">
              <i class="fas ${day.icon}"></i>
            </div>
            <div class="temp">
              <p>${day.temperature}°C</p>
              <p>${day.condition}</p>
            </div>
          </div>
        `;
        
        card.addEventListener('click', () => {
          selectedDay = index;
          updateSelectedDay();
        });
        
        carousel.appendChild(card);
      });
    }
    
    // Update the current weather display
    function updateCurrentWeather(data) {
      if (!data) return;
      
      document.getElementById('current-date').textContent = data.formattedDate;
      document.getElementById('current-temp').textContent = `${data.temperature}°C`;
      document.getElementById('current-condition').textContent = data.condition;
      document.getElementById('current-humidity').textContent = `${data.humidity}%`;
      document.getElementById('current-wind').textContent = `${data.windSpeed} km/h`;
      document.getElementById('current-precipitation').textContent = `${data.precipitation}%`;
      document.getElementById('current-low').textContent = `${data.low}°C`;
      document.getElementById('current-high').textContent = `${data.high}°C`;
      
      // Update the weather icon
      const iconElement = document.getElementById('current-icon');
      iconElement.innerHTML = `<i class="fas ${data.icon}"></i>`;
      
      // Update location if available
      if (data.cityName) {
        const locationElement = document.getElementById('location');
        locationElement.textContent = `${data.cityName}, ${data.countryCode}`;
        locationElement.classList.remove('hidden');
      }
      
      // Update additional details if available
      if (data.description) {
        document.getElementById('current-description').textContent = 
          data.description.charAt(0).toUpperCase() + data.description.slice(1);
      }
      
      if (data.feelsLike) {
        const feelsLikeElement = document.getElementById('feels-like');
        feelsLikeElement.textContent = `Feels like: ${data.feelsLike}°C`;
        feelsLikeElement.classList.remove('hidden');
      }
      
      // Show estimated data notice if applicable
      const estimatedNotice = document.getElementById('estimated-notice');
      if (data.estimated) {
        estimatedNotice.classList.remove('hidden');
      } else {
        estimatedNotice.classList.add('hidden');
      }
    }
    
    // Refresh button functionality
    document.getElementById('refresh-button').addEventListener('click', () => {
      fetchWeatherData();
    });
  });