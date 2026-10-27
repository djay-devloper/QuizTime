import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("quiztime-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data;
    const field = body?.fieldErrors?.[0];
    if (field) return `${field.field}: ${field.message}`;
    return body?.error || error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
