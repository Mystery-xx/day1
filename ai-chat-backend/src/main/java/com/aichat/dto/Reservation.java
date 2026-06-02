package com.aichat.dto;

public class Reservation {
    private String restaurantAddress;
    private String date;
    private String time;
    private Integer numberOfGuests;

    public Reservation() {}

    public Reservation(String restaurantAddress, String date, String time, Integer numberOfGuests) {
        this.restaurantAddress = restaurantAddress;
        this.date = date;
        this.time = time;
        this.numberOfGuests = numberOfGuests;
    }

    public String getRestaurantAddress() {
        return restaurantAddress;
    }

    public void setRestaurantAddress(String restaurantAddress) {
        this.restaurantAddress = restaurantAddress;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public String getTime() {
        return time;
    }

    public void setTime(String time) {
        this.time = time;
    }

    public Integer getNumberOfGuests() {
        return numberOfGuests;
    }

    public void setNumberOfGuests(Integer numberOfGuests) {
        this.numberOfGuests = numberOfGuests;
    }

    public boolean isComplete() {
        return restaurantAddress != null && !restaurantAddress.isEmpty()
                && date != null && !date.isEmpty()
                && time != null && !time.isEmpty()
                && numberOfGuests != null && numberOfGuests > 0;
    }
}
