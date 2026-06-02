function ReservationPanel({ reservation }) {
  if (!reservation) {
    return (
      <div className="reservation-panel">
        <h2 className="reservation-title">Заказ столика</h2>
        <div className="reservation-empty">
          Начните чат, чтобы оформить заказ
        </div>
      </div>
    );
  }

  const fields = [
    { key: 'restaurantAddress', label: 'Адрес ресторана', value: reservation.restaurantAddress },
    { key: 'date', label: 'Дата', value: reservation.date },
    { key: 'time', label: 'Время', value: reservation.time },
    { key: 'numberOfGuests', label: 'Количество гостей', value: reservation.numberOfGuests ? `${reservation.numberOfGuests}` : null },
  ];

  const isComplete = reservation.restaurantAddress && reservation.date && reservation.time && reservation.numberOfGuests;

  return (
    <div className="reservation-panel">
      <h2 className="reservation-title">Заказ столика</h2>
      
      <div className="reservation-fields">
        {fields.map((field) => (
          <div key={field.key} className={`reservation-field ${field.value ? 'filled' : 'empty'}`}>
            <label className="field-label">{field.label}</label>
            <div className="field-value">
              {field.value || '—'}
            </div>
          </div>
        ))}
      </div>

      {isComplete && (
        <div className="reservation-confirm">
          <p className="confirm-text">
            Все данные заполнены. Подтвердите заказ в чате.
          </p>
        </div>
      )}
    </div>
  );
}

export default ReservationPanel;
