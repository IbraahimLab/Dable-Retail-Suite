import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api`,
  timeout: 30000,
});

export async function apiRequest({ token, method = "GET", url, data, params, headers }) {
  try {
    const response = await api.request({
      url,
      method,
      data,
      params,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    return response.data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Unexpected error while calling API";
    throw new Error(message);
  }
}

export default api;
