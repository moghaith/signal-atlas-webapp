export const selectStyles = {
  control: (base, state) => ({
    ...base,
    minWidth: 180,
    borderRadius: 12,
    borderColor: state.isFocused ? "#6b9ae8" : "#e2e8f0",
    boxShadow: state.isFocused
      ? "0 0 0 3px rgba(107, 154, 232, 0.15)"
      : "none",
    "&:hover": {
      borderColor: "#6b9ae8",
    },
    backgroundColor: "#fff",
    fontSize: 13,
  }),

  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
  }),

  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#6b9ae8"
      : state.isFocused
      ? "#f1f5ff"
      : "white",
    color: state.isSelected ? "white" : "#1e293b",
    fontSize: 13,
    cursor: "pointer",
  }),
};
