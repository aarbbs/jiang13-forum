declare module '@svg-maps/world' {
  const map: {
    label: string;
    viewBox: string;
    locations: Array<{ id: string; name: string; path: string }>;
  };
  export default map;
}

declare module '@svg-maps/china' {
  const map: {
    label: string;
    viewBox: string;
    locations: Array<{ id: string; name: string; path: string }>;
  };
  export default map;
}
