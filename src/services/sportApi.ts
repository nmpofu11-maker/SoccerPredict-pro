/**
 * SportAPI Service
 * 
 * Integrates with the SportAPI provider via RapidAPI.
 */
import axios from 'axios';

const BASE_URL = 'https://sportapi7.p.rapidapi.com';
const API_KEY = process.env.SPORTAPI_KEY; // Ensure this is set in the environment

const headers = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'sportapi7.p.rapidapi.com',
};

export async function fetchCategories(date: string) {
  const response = await axios.get(`${BASE_URL}/api/v1/sport/football/${date}/0/categories`, { headers });
  return response.data.categories;
}

export async function fetchEventsByCategory(categoryId: number, date: string) {
  const response = await axios.get(`${BASE_URL}/api/v1/category/${categoryId}/scheduled-events/${date}`, { headers });
  return response.data.events;
}

export async function fetchEventDetails(eventId: number) {
  const [info, incidents, lineups, stats, odds] = await Promise.all([
    axios.get(`${BASE_URL}/api/v1/event/${eventId}`, { headers }),
    axios.get(`${BASE_URL}/api/v1/event/${eventId}/incidents`, { headers }),
    axios.get(`${BASE_URL}/api/v1/event/${eventId}/lineups`, { headers }),
    axios.get(`${BASE_URL}/api/v1/event/${eventId}/statistics`, { headers }),
    axios.get(`${BASE_URL}/api/v1/event/${eventId}/odds/1/all`, { headers }),
  ]);
  
  return {
    info: info.data,
    incidents: incidents.data,
    lineups: lineups.data,
    stats: stats.data,
    odds: odds.data,
  };
}
